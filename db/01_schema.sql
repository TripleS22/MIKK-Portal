-- =====================================================================
--  MIKK CLIENT PORTAL — SKEMA DASAR (FASE 1)
--  Target   : PostgreSQL 14+ / Supabase
--  Versi    : 1.0
--  Acuan    : SPESIFIKASI_MODEL_DATA_MIKK_PORTAL.md
--
--  Urutan jalankan: 01_schema.sql → 02_rls_dan_views.sql → 03_seed_nhc.sql
--
--  PRINSIP YANG DITEGAKKAN DI BERKAS INI
--    P1  Status keputusan disimpan; status waktu dihitung di VIEW.
--        Tidak ada kolom sisa_hari / status_waktu di tabel mana pun.
--    P2  Isolasi antar klien ditegakkan RLS (berkas 02), bukan di UI.
--    P3  Kosakata klien (kategori, jenis dokumen, format nomor) = data,
--        bukan enum di kode.
--    P4  Perpanjangan adalah relasi (parent_contract_id), bukan baris lepas.
--    P5  Harga dibekukan saat transaksi (kolom snap_*).
--    P7  Uang bertipe numeric(18,2), tidak pernah float.
--    P8  Baris keuangan tidak dihapus; pembatalan lewat dokumen lawan.
-- =====================================================================

-- pg_trgm  : pencocokan nama untuk conflict check
-- btree_gist: constraint anti-tumpang-tindih pada tabel tarif
-- Keduanya tersedia standar di Supabase. gen_random_uuid() sudah inti PostgreSQL 13+,
-- jadi pgcrypto tidak diperlukan.
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Identitas pengguna aktif.
-- Di Supabase auth.uid() tersedia; di luar itu jatuh ke GUC app.current_user_id
-- sehingga skema ini bisa diuji di Postgres polos.
-- ---------------------------------------------------------------------
create or replace function app.current_user_id() returns uuid
language plpgsql stable as $$
declare uid uuid;
begin
  begin
    execute 'select auth.uid()' into uid;
    if uid is not null then return uid; end if;
  exception when others then
    null;
  end;
  return nullif(current_setting('app.current_user_id', true), '')::uuid;
end $$;

-- =====================================================================
-- 1. PENGGUNA, KLIEN, DAN KEANGGOTAAN
-- =====================================================================

create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  nama       text not null,
  no_hp      text,
  tipe       text not null check (tipe in ('mikk_staff','client_user','prospect')),
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table users is 'Di Supabase, id disamakan dengan auth.users.id.';

create table mikk_staff (
  user_id uuid primary key references users(id) on delete cascade,
  jabatan text not null check (jabatan in
            ('managing_partner','senior_associate','associate','admin_staf')),
  gelar   text,
  aktif   boolean not null default true
);

create table client_orgs (
  id              uuid primary key default gen_random_uuid(),
  nama_legal      text not null,
  nama_singkat    text not null unique,
  npwp            text,
  nib             text,
  kbli            text[] not null default '{}',   -- penggerak gap analysis perizinan
  sektor_usaha    text,
  alamat          text,
  logo_path       text,
  status_retainer text not null default 'aktif'
                  check (status_retainer in ('aktif','tertunda','berakhir')),
  retainer_mulai  date,
  retainer_akhir  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column client_orgs.kbli is
  'Menentukan izin apa yang wajib dimiliki. Tanpa ini gap analysis tidak berfungsi.';

-- Pengguna dari pihak klien
create table client_memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  client_org_id uuid not null references client_orgs(id) on delete cascade,
  peran         text not null check (peran in ('admin_klien','legal_manager','viewer')),
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (user_id, client_org_id)
);

-- Penugasan staf MIKK ke klien. Menggantikan kolom tunggal pic_mikk_id:
-- satu klien bisa punya PIC utama + pendukung, dan orangnya bisa berganti.
create table client_assignments (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid not null references client_orgs(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  peran         text not null check (peran in ('pic_utama','pendukung','supervisi')),
  mulai         date not null default current_date,
  selesai       date,
  unique (client_org_id, user_id, mulai),
  constraint assignment_rentang_wajar check (selesai is null or selesai >= mulai)
);

-- Hanya boleh ada satu PIC utama aktif per klien pada satu waktu.
create unique index client_assignments_satu_pic_utama
  on client_assignments (client_org_id)
  where peran = 'pic_utama' and selesai is null;

-- =====================================================================
-- 2. REGISTRI LAWAN PIHAK (dasar conflict check)
-- =====================================================================

create table counterparties (
  id            uuid primary key default gen_random_uuid(),
  nama_legal    text not null,
  nama_alias    text[] not null default '{}',
  npwp          text,
  nib           text,
  jenis         text check (jenis in
                  ('pt','cv','yayasan','koperasi','perorangan','instansi','lainnya')),
  is_client     boolean not null default false,
  client_org_id uuid references client_orgs(id),
  catatan       text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  constraint counterparty_klien_konsisten check (
    (is_client and client_org_id is not null) or (not is_client)
  )
);

create index counterparties_nama_trgm on counterparties using gin (nama_legal gin_trgm_ops);
create index counterparties_client on counterparties (client_org_id) where is_client;

comment on table counterparties is
  'Registri global. Klien TIDAK boleh membaca seluruh isinya — lihat RLS di berkas 02. '
  'Pencocokan benturan kepentingan dijalankan lewat fungsi security definer '
  'yang hanya mengembalikan putusan, bukan daftar.';

-- =====================================================================
-- 3. KONTRAK
-- =====================================================================

create table contract_categories (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid not null references client_orgs(id) on delete cascade,
  nama          text not null,
  warna         text,
  urutan        integer not null default 0,
  aktif         boolean not null default true,
  unique (client_org_id, nama)
);
comment on table contract_categories is
  'P3: "Pool & Agen" adalah kosakata NHC, bukan universal. Kategori = data per klien.';

create table contracts (
  id                  uuid primary key default gen_random_uuid(),
  client_org_id       uuid not null references client_orgs(id) on delete cascade,

  nomor_dokumen       text,
  nomor_normalized    text generated always as (
                        upper(regexp_replace(coalesce(nomor_dokumen,''), '[^A-Za-z0-9]', '', 'g'))
                      ) stored,
  judul               text not null,

  counterparty_id     uuid references counterparties(id),
  kategori_id         uuid references contract_categories(id),
  jenis_dokumen       text,

  tanggal_mulai       date,
  tanggal_berakhir    date,
  tanpa_batas_waktu   boolean not null default false,

  nilai_kontrak       numeric(18,2),
  mata_uang           char(3) not null default 'IDR',
  nilai_tidak_relevan boolean not null default false,

  status_siklus       text not null default 'draf' check (status_siklus in
                        ('draf','dalam_review','aktif','selesai',
                         'dibatalkan','diputus','digantikan')),

  parent_contract_id  uuid references contracts(id),
  relasi_ke_induk     text check (relasi_ke_induk in
                        ('perpanjangan','addendum','amandemen','penggantian')),

  auto_renew          boolean not null default false,
  notice_period_hari  integer check (notice_period_hari is null or notice_period_hari >= 0),

  pic_legal_id        uuid references users(id),
  keterangan          text,
  catatan_migrasi     text,

  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint contracts_tgl_masuk_akal check (
    tanggal_berakhir is null or tanggal_mulai is null
    or tanggal_berakhir >= tanggal_mulai
  ),
  constraint contracts_induk_wajib_relasi check (
    (parent_contract_id is null and relasi_ke_induk is null)
    or (parent_contract_id is not null and relasi_ke_induk is not null)
  ),
  constraint contracts_bukan_induk_sendiri check (parent_contract_id <> id),
  constraint contracts_tanpa_batas_konsisten check (
    not tanpa_batas_waktu or tanggal_berakhir is null
  ),
  constraint contracts_nilai_konsisten check (
    not (nilai_tidak_relevan and nilai_kontrak is not null)
  )
);

create unique index contracts_nomor_unik
  on contracts (client_org_id, nomor_normalized)
  where nomor_dokumen is not null and nomor_dokumen <> '';

create index contracts_org        on contracts (client_org_id);
create index contracts_berakhir   on contracts (tanggal_berakhir)
  where status_siklus = 'aktif' and tanggal_berakhir is not null;
create index contracts_parent     on contracts (parent_contract_id);
create index contracts_pic        on contracts (pic_legal_id);
create index contracts_judul_trgm on contracts using gin (judul gin_trgm_ops);

comment on column contracts.nilai_tidak_relevan is
  'Membedakan "belum diisi" dari "memang tanpa nilai rupiah" (NDA, MOU, surat pemberhentian).';
comment on column contracts.tanpa_batas_waktu is
  'Membedakan "seumur hidup" dari "tanggal belum diisi".';
comment on column contracts.parent_contract_id is
  'P4: perpanjangan menunjuk induknya. Tanpa ini satu lokasi terhitung berkali-kali '
  'dan kontrak lama tetap tampil kedaluwarsa.';

-- Dokumen hukum yang BUKAN kontrak. Dipisah agar tidak ikut terhitung.
create table legal_correspondence (
  id                  uuid primary key default gen_random_uuid(),
  client_org_id       uuid not null references client_orgs(id) on delete cascade,
  nomor_dokumen       text,
  judul               text not null,
  jenis               text not null check (jenis in
                        ('somasi','pengaduan','pemberitahuan','pemutusan','bast',
                         'protap','perdamaian','permohonan','lainnya')),
  counterparty_id     uuid references counterparties(id),
  tanggal             date,
  terkait_contract_id uuid references contracts(id),
  pic_legal_id        uuid references users(id),
  keterangan          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index legal_correspondence_org on legal_correspondence (client_org_id);

-- =====================================================================
-- 4. PERIZINAN
-- =====================================================================

create table permit_types (
  id                 uuid primary key default gen_random_uuid(),
  kode               text not null unique,
  nama               text not null,
  instansi           text,
  masa_berlaku_bulan integer,
  kbli_terkait       text[] not null default '{}',  -- kosong = berlaku semua sektor
  wajib              boolean not null default false,
  masih_berlaku      boolean not null default true, -- TDP => false (dilebur ke NIB via OSS)
  catatan            text
);
comment on table permit_types is
  'Master referensi hukum, bukan data klien. Wajib diisi tim MIKK sebelum rilis — '
  'tanpa ini gap analysis tidak berfungsi.';

create table permits (
  id                  uuid primary key default gen_random_uuid(),
  client_org_id       uuid not null references client_orgs(id) on delete cascade,
  permit_type_id      uuid references permit_types(id),
  nama_izin           text not null,
  nomor_izin          text,
  instansi_penerbit   text,
  tanggal_terbit      date,
  tanggal_kedaluwarsa date,
  tanpa_batas_waktu   boolean not null default false,   -- NIB, NPWP
  status_siklus       text not null default 'aktif' check (status_siklus in
                        ('aktif','dalam_pengurusan','dicabut','tidak_berlaku_lagi')),
  pic_id              uuid references users(id),
  keterangan          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint permits_tanpa_batas_konsisten check (
    not tanpa_batas_waktu or tanggal_kedaluwarsa is null
  ),
  constraint permits_tgl_masuk_akal check (
    tanggal_kedaluwarsa is null or tanggal_terbit is null
    or tanggal_kedaluwarsa >= tanggal_terbit
  )
);
create index permits_org       on permits (client_org_id);
create index permits_kadaluarsa on permits (tanggal_kedaluwarsa)
  where status_siklus = 'aktif' and tanggal_kedaluwarsa is not null;

-- =====================================================================
-- 5. DOKUMEN & PENOMORAN
-- =====================================================================

create table documents (
  id                 uuid primary key default gen_random_uuid(),
  client_org_id      uuid not null references client_orgs(id) on delete cascade,
  storage_path       text not null,
  nama_file          text not null,
  mime_type          text,
  ukuran_byte        bigint,
  sha256             text,
  versi              integer not null default 1,
  parent_document_id uuid references documents(id),
  kategori_arsip     text,
  tahun_arsip        integer,
  rahasia            boolean not null default true,
  uploaded_by        uuid references users(id),
  uploaded_at        timestamptz not null default now()
);
create index documents_org  on documents (client_org_id);
create index documents_hash on documents (client_org_id, sha256);
comment on column documents.storage_path is
  'Bucket PRIVAT. Akses hanya lewat signed URL berumur pendek setelah pengecekan RLS. '
  'Tidak ada URL publik untuk dokumen hukum klien.';

create table document_links (
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null check (entity_type in
                ('contract','permit','case','project','correspondence','client_org')),
  entity_id   uuid not null,
  primary key (document_id, entity_type, entity_id)
);
create index document_links_entity on document_links (entity_type, entity_id);

create table document_number_registry (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid not null references client_orgs(id) on delete cascade,
  kode_jenis    text not null,
  format        text not null,
  tahun         integer not null,
  urut_terakhir integer not null default 0,
  unique (client_org_id, kode_jenis, tahun)
);
comment on table document_number_registry is
  'Nomor surat diambil dari sini, tidak diketik manual. Excel NHC memuat 3 nomor duplikat.';

-- =====================================================================
-- 6. JEJAK AUDIT (trigger, bukan panggilan dari aplikasi)
-- =====================================================================

create table audit_log (
  id            bigserial primary key,
  actor_id      uuid,
  aksi          text not null check (aksi in ('insert','update','delete')),
  entity_type   text not null,
  entity_id     uuid,
  client_org_id uuid,
  sebelum       jsonb,
  sesudah       jsonb,
  terjadi_at    timestamptz not null default now()
);
create index audit_log_entity on audit_log (entity_type, entity_id, terjadi_at desc);
create index audit_log_org    on audit_log (client_org_id, terjadi_at desc);

create or replace function app.fn_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_row jsonb;
begin
  v_row := to_jsonb(coalesce(new, old));
  begin
    v_org := (v_row ->> 'client_org_id')::uuid;
  exception when others then
    v_org := null;
  end;

  insert into audit_log (actor_id, aksi, entity_type, entity_id, client_org_id, sebelum, sesudah)
  values (
    app.current_user_id(),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_org,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function app.fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_audit_contracts
  after insert or update or delete on contracts
  for each row execute function app.fn_audit();
create trigger trg_audit_permits
  after insert or update or delete on permits
  for each row execute function app.fn_audit();
create trigger trg_audit_documents
  after insert or update or delete on documents
  for each row execute function app.fn_audit();
create trigger trg_audit_client_orgs
  after insert or update or delete on client_orgs
  for each row execute function app.fn_audit();
create trigger trg_audit_counterparties
  after insert or update or delete on counterparties
  for each row execute function app.fn_audit();

create trigger trg_touch_contracts before update on contracts
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_permits before update on permits
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_client_orgs before update on client_orgs
  for each row execute function app.fn_touch_updated_at();

-- =====================================================================
-- 7. PENGINGAT
-- =====================================================================

create table reminder_rules (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid references client_orgs(id) on delete cascade,  -- null = aturan bawaan
  entity_type   text not null check (entity_type in ('contract','permit')),
  offset_hari   integer[] not null default '{180,90,60,30,14,7,1}',
  kanal         text[] not null default '{email,in_app}',
  aktif         boolean not null default true
);
comment on column reminder_rules.kanal is
  'Fase 1: email + in_app saja. WhatsApp otomatis butuh WA Business API '
  '(berbayar, verifikasi bisnis, template disetujui Meta).';

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid references client_orgs(id) on delete cascade,
  user_id       uuid references users(id) on delete cascade,
  entity_type   text,
  entity_id     uuid,
  judul         text not null,
  isi           text,
  kanal         text not null,
  dedup_key     text unique,          -- 'contract:{id}:h-30' → cegah kirim ganda
  dibaca_at     timestamptz,
  terkirim_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

-- =====================================================================
-- 8. KEUANGAN — struktur wajib ada sejak Fase 1 walau belum dipakai
--    Menambahkannya di Fase 3 berarti menghitung ulang seluruh riwayat.
-- =====================================================================

create table service_rates (
  id                 uuid primary key default gen_random_uuid(),
  kode               text not null,
  nama               text not null,
  deskripsi          text,
  jenis_layanan      text not null check (jenis_layanan in
                       ('konsultasi_online','konsultasi_offline','konsultasi_luar_kota')),
  tier               text check (tier in
                       ('managing_partner','senior_associate','associate','umum')),
  kategori_perkara   text[] not null default '{}',
  satuan             text not null check (satuan in ('per_jam','per_sesi','per_hari')),
  durasi_menit       integer,
  harga              numeric(18,2),
  mata_uang          char(3) not null default 'IDR',
  harga_termasuk_ppn boolean not null default false,
  butuh_penawaran    boolean not null default false,
  berlaku_sejak      date not null,
  berlaku_sampai     date,
  aktif              boolean not null default true,
  urutan             integer not null default 0,
  ditetapkan_oleh    uuid references users(id),
  created_at         timestamptz not null default now(),
  constraint rates_harga_atau_penawaran check (
    (butuh_penawaran and harga is null) or (not butuh_penawaran and harga is not null)
  ),
  constraint rates_rentang_wajar check (berlaku_sampai is null or berlaku_sampai > berlaku_sejak)
);

-- Tarif tidak pernah di-EDIT, hanya diakhiri lalu dibuat versi baru.
-- Constraint ini menegakkannya di level database.
alter table service_rates add constraint rates_tidak_tumpang_tindih
  exclude using gist (
    kode with =,
    daterange(berlaku_sejak, coalesce(berlaku_sampai, 'infinity'::date), '[)') with &&
  ) where (aktif);

create table retainer_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  client_org_id       uuid not null references client_orgs(id) on delete cascade,
  nomor_engagement    text,
  tanggal_engagement  date,
  engagement_doc_id   uuid references documents(id),
  nilai_retainer      numeric(18,2) not null check (nilai_retainer >= 0),
  periode             text not null check (periode in
                        ('bulanan','triwulanan','semesteran','tahunan')),
  harga_termasuk_ppn  boolean not null default false,
  lingkup_layanan     text,
  kuota_jam           numeric(6,1),
  kuota_terpakai      numeric(6,1) not null default 0,
  tarif_kelebihan_jam numeric(18,2),
  mulai               date not null,
  akhir               date,
  auto_renew          boolean not null default false,
  notice_period_hari  integer,
  status              text not null default 'draf' check (status in
                        ('draf','aktif','ditangguhkan','berakhir','dibatalkan')),
  pic_mikk_id         uuid references users(id),
  created_at          timestamptz not null default now(),
  constraint subs_rentang_wajar check (akhir is null or akhir >= mulai)
);
comment on table retainer_subscriptions is
  'Pendapatan utama firma — tidak ada di brief maupun mockup. '
  'Juga menjadi jembatan Role 1 -> Role 2 saat engagement letter ditandatangani.';

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  nomor_invoice       text not null unique,
  client_org_id       uuid references client_orgs(id),
  user_id             uuid references users(id),
  tipe                text not null check (tipe in
                        ('retainer','konsultasi','perkara','penawaran','lainnya')),
  subscription_id     uuid references retainer_subscriptions(id),
  periode_mulai       date,
  periode_akhir       date,
  tanggal_terbit      date not null,
  jatuh_tempo         date not null,

  dpp                 numeric(18,2) not null default 0,
  ppn_persen          numeric(5,2)  not null default 0,
  ppn_nilai           numeric(18,2) not null default 0,
  total_tagihan       numeric(18,2) not null default 0,

  -- PPh 23: klien korporat memotong di muka. Selisihnya BUKAN kurang bayar.
  pph23_persen        numeric(5,2)  not null default 0,
  pph23_nilai         numeric(18,2) not null default 0,
  nilai_diterima_neto numeric(18,2) not null default 0,
  nomor_bukti_potong  text,
  tanggal_bukti_potong date,
  bukti_potong_doc_id uuid references documents(id),

  nomor_faktur_pajak  text,
  status              text not null default 'draf' check (status in
                        ('draf','terkirim','dibayar_sebagian','lunas',
                         'jatuh_tempo','dibatalkan','nota_kredit')),
  reversal_dari_id    uuid references invoices(id),
  catatan             text,
  dibuat_oleh         uuid references users(id),
  created_at          timestamptz not null default now(),

  constraint inv_total_konsisten check (total_tagihan = dpp + ppn_nilai),
  constraint inv_neto_konsisten  check (nilai_diterima_neto = total_tagihan - pph23_nilai),
  constraint inv_jatuh_tempo     check (jatuh_tempo >= tanggal_terbit)
);
create index invoices_org on invoices (client_org_id, tanggal_terbit desc);

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  urutan       integer not null default 0,
  deskripsi    text not null,
  kuantitas    numeric(12,2) not null default 1,
  satuan       text,
  harga_satuan numeric(18,2) not null,
  jumlah       numeric(18,2) not null,
  kena_ppn     boolean not null default true
);

create table payments (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid references invoices(id),
  tanggal_bayar        date not null,
  metode               text not null check (metode in
                         ('transfer_bank','virtual_account','qris','kartu','ewallet','tunai')),
  nilai_dibayar        numeric(18,2) not null check (nilai_dibayar >= 0),
  biaya_gateway        numeric(18,2) not null default 0,
  nilai_masuk_rekening numeric(18,2) not null,
  gateway_provider     text,
  gateway_ref          text,
  gateway_status       text,
  settlement_at        date,
  rekening_tujuan      text,
  bukti_doc_id         uuid references documents(id),
  dicatat_oleh         uuid references users(id),
  created_at           timestamptz not null default now(),
  constraint pay_masuk_konsisten check (nilai_masuk_rekening = nilai_dibayar - biaya_gateway)
);
create index payments_invoice on payments (invoice_id);
