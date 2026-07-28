-- =====================================================================
--  FASE 3 — CORONG CALON KLIEN & KONSULTASI BERBAYAR
--  Jalankan setelah 07_fase2_rls_views.sql
--
--  KEPUTUSAN PENTING YANG DIBAWA DARI PRD (Bagian 2.3 & 7.3):
--  Conflict check adalah GERBANG SEBELUM PEMBAYARAN, bukan sesudah.
--  Uang calon klien tidak boleh pernah tertahan untuk kasus yang pada
--  akhirnya ditolak firma. Karena itu kolom putusan_benturan ada di
--  tabel consultations dan diperiksa sebelum booking boleh dibayar —
--  lihat constraint consult_bayar_setelah_konflik di bawah.
--
--  Tarif TIDAK ditulis di sini. Harga hidup di service_rates (01_schema)
--  yang sudah menyediakan jenis_layanan online/offline/luar_kota,
--  satuan, durasi_menit, dan butuh_penawaran untuk "menyesuaikan".
--  Booking hanya menyimpan rujukan ke tarif + harga yang DIBEKUKAN saat
--  pemesanan, supaya perubahan tarif di kemudian hari tidak mengubah
--  nilai transaksi yang sudah terjadi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identitas calon klien.
-- Dipisah dari client_orgs: calon klien BELUM tentu jadi klien retainer,
-- dan menaruhnya di client_orgs akan membuat mereka ikut terhitung di
-- seluruh dashboard serta gap analysis klien sungguhan.
-- ---------------------------------------------------------------------
create table prospects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references users(id) on delete cascade,

  -- Kode akses yang ditunjukkan ke calon klien untuk menengok kembali
  -- statusnya. BUKAN pengganti kata sandi: server tetap meminta kata
  -- sandi saat login (lihat catatan di server/routes/prospects.routes.js).
  kode_akses       text not null unique,

  tipe             text not null check (tipe in ('perorangan','badan_usaha')),
  nama             text not null,               -- nama orang / nama korporasi
  email            text not null,
  no_hp            text,
  kewarganegaraan  text,
  alamat           text,
  nama_pic         text,                        -- diisi bila tipe = badan_usaha
  nib              text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index prospects_user on prospects (user_id);
comment on table prospects is
  'Calon klien yang belum jadi klien retainer. Sengaja terpisah dari '
  'client_orgs supaya tidak ikut terhitung di dashboard klien sungguhan.';

-- ---------------------------------------------------------------------
-- Satu permintaan konsultasi = satu baris.
-- Klasifikasi kasus, kronologi, target, dan putusan benturan kepentingan
-- disatukan di sini karena alurnya linear (wizard 3 langkah) dan tidak
-- ada kasus nyata di mana satu permintaan punya banyak klasifikasi.
-- ---------------------------------------------------------------------
create table consultations (
  id                uuid primary key default gen_random_uuid(),
  prospect_id       uuid not null references prospects(id) on delete cascade,
  nomor             text not null unique,        -- KSL-2026-0001

  kategori_layanan  text not null check (kategori_layanan in
                      ('pidana','perdata','litigasi','korporasi','lainnya')),
  kronologi         text not null,
  target_hukum      text,
  lawan_pihak_nama  text,                        -- dipakai conflict check

  -- Gerbang benturan kepentingan. 'belum_diperiksa' adalah keadaan awal;
  -- pembayaran ditolak selama nilainya belum 'aman'.
  putusan_benturan  text not null default 'belum_diperiksa'
                      check (putusan_benturan in
                        ('belum_diperiksa','aman','perlu_ditinjau','terbentur')),
  alasan_benturan   text,
  ditinjau_oleh     uuid references users(id),
  ditinjau_at       timestamptz,

  status            text not null default 'draf' check (status in
                      ('draf','menunggu_tinjauan','disetujui','ditolak','selesai')),
  catatan_firma     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index consultations_prospect on consultations (prospect_id);
create index consultations_status   on consultations (status);

-- ---------------------------------------------------------------------
-- Pemesanan jadwal + harga yang dibekukan.
-- ---------------------------------------------------------------------
create table consultation_bookings (
  id                uuid primary key default gen_random_uuid(),
  consultation_id   uuid not null references consultations(id) on delete cascade,
  service_rate_id   uuid references service_rates(id),

  jenis_meeting     text not null check (jenis_meeting in
                      ('online','offline_bandung','offline_luar_kota')),
  tanggal           date,
  jam_mulai         time,
  durasi_menit      integer,
  lokasi            text,                        -- diisi untuk offline luar kota

  -- Harga DIBEKUKAN saat pemesanan. Perubahan service_rates setelahnya
  -- tidak boleh mengubah nilai transaksi yang sudah terjadi.
  harga_satuan      numeric(18,2),
  diskon            numeric(18,2) not null default 0 check (diskon >= 0),
  total             numeric(18,2),
  mata_uang         char(3) not null default 'IDR',
  butuh_penawaran   boolean not null default false,   -- luar kota: "menyesuaikan"

  kupon_id          uuid,
  status_bayar      text not null default 'belum_dibayar' check (status_bayar in
                      ('belum_dibayar','menunggu_konfirmasi','lunas','dibatalkan','kedaluwarsa')),
  invoice_id        uuid references invoices(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Konsisten: yang butuh penawaran tidak boleh punya harga, dan sebaliknya.
  constraint booking_harga_atau_penawaran check (
    (butuh_penawaran and harga_satuan is null and total is null)
    or (not butuh_penawaran and harga_satuan is not null)
  )
);
create index bookings_consultation on consultation_bookings (consultation_id);
create unique index bookings_satu_aktif_per_konsultasi
  on consultation_bookings (consultation_id)
  where status_bayar not in ('dibatalkan','kedaluwarsa');

-- ---------------------------------------------------------------------
-- Berkas legalitas & lampiran calon klien.
-- Tidak memakai tabel documents: documents.client_org_id NOT NULL, dan
-- calon klien memang belum punya organisasi klien. Memaksakannya ke sana
-- akan melemahkan constraint yang justru melindungi data klien sungguhan.
-- ---------------------------------------------------------------------
create table prospect_documents (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references prospects(id) on delete cascade,
  consultation_id uuid references consultations(id) on delete cascade,
  jenis           text not null check (jenis in
                    ('ktp_paspor','akta_pendirian','nib','lampiran_kasus','lainnya')),
  storage_path    text not null,
  nama_file       text not null,
  mime_type       text,
  ukuran_byte     bigint,
  sha256          text,
  uploaded_at     timestamptz not null default now()
);
create index prospect_docs_prospect on prospect_documents (prospect_id);

-- ---------------------------------------------------------------------
-- Kupon / voucher. Diterbitkan Managing Partner (lihat mockup: "kode
-- kupon khusus dari Managing Partner").
-- ---------------------------------------------------------------------
create table coupons (
  id              uuid primary key default gen_random_uuid(),
  kode            text not null unique,
  deskripsi       text,
  tipe            text not null check (tipe in ('persen','nominal','gratis')),
  nilai           numeric(18,2),                 -- persen 0-100, atau rupiah
  jenis_layanan   text[] not null default '{}',  -- kosong = berlaku semua
  kuota           integer,                       -- null = tak terbatas
  terpakai        integer not null default 0,
  berlaku_sejak   date not null default current_date,
  berlaku_sampai  date,
  aktif           boolean not null default true,
  diterbitkan_oleh uuid references users(id),
  created_at      timestamptz not null default now(),

  constraint kupon_nilai_wajar check (
    (tipe = 'gratis' and nilai is null)
    or (tipe = 'persen'  and nilai > 0 and nilai <= 100)
    or (tipe = 'nominal' and nilai > 0)
  ),
  constraint kupon_kuota_wajar check (kuota is null or terpakai <= kuota),
  constraint kupon_rentang_wajar check (berlaku_sampai is null or berlaku_sampai >= berlaku_sejak)
);

alter table consultation_bookings
  add constraint bookings_kupon_fk foreign key (kupon_id) references coupons(id);

-- ---------------------------------------------------------------------
-- Penomoran konsultasi: KSL-<tahun>-<urut 4 digit>.
-- Memakai tabel registry yang sudah ada supaya penomoran seluruh sistem
-- punya satu mekanisme, bukan dua.
-- ---------------------------------------------------------------------
create or replace function app.nomor_konsultasi_berikutnya() returns text
language plpgsql volatile security definer set search_path = public, app as $$
declare
  v_tahun int := extract(year from current_date);
  v_urut  int;
begin
  -- Kunci baris per tahun supaya dua pendaftaran bersamaan tidak
  -- mendapat nomor yang sama.
  select coalesce(max(substring(nomor from 10)::int), 0) + 1
    into v_urut
    from consultations
   where nomor like 'KSL-' || v_tahun || '-%';
  return 'KSL-' || v_tahun || '-' || lpad(v_urut::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Trigger updated_at + audit — pola sama dengan tabel Fase 1 & 2.
-- ---------------------------------------------------------------------
create trigger trg_touch_prospects before update on prospects
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_consultations before update on consultations
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_bookings before update on consultation_bookings
  for each row execute function app.fn_touch_updated_at();

create trigger trg_audit_consultations after insert or update or delete on consultations
  for each row execute function app.fn_audit();
create trigger trg_audit_bookings after insert or update or delete on consultation_bookings
  for each row execute function app.fn_audit();
create trigger trg_audit_coupons after insert or update or delete on coupons
  for each row execute function app.fn_audit();
