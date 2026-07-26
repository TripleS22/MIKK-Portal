-- =====================================================================
--  MIKK CLIENT PORTAL — ISOLASI DATA (RLS) & STATUS TERHITUNG
--  Jalankan setelah 01_schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fungsi pembantu hak akses
-- ---------------------------------------------------------------------

create or replace function app.is_mikk_admin() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from mikk_staff s
    where s.user_id = app.current_user_id()
      and s.aktif
      and s.jabatan in ('managing_partner','admin_staf')
  );
$$;

create or replace function app.is_managing_partner() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from mikk_staff s
    where s.user_id = app.current_user_id()
      and s.aktif and s.jabatan = 'managing_partner'
  );
$$;

-- Klien yang boleh dilihat pengguna aktif:
--   a) organisasi tempat ia menjadi anggota (sisi klien), atau
--   b) klien yang ditugaskan kepadanya (sisi staf MIKK).
-- Managing Partner & admin_staf ditangani terpisah lewat is_mikk_admin().
create or replace function app.my_client_ids() returns setof uuid
language sql stable security definer set search_path = public, app as $$
  select cm.client_org_id
    from client_memberships cm
   where cm.user_id = app.current_user_id() and cm.aktif
  union
  select ca.client_org_id
    from client_assignments ca
   where ca.user_id = app.current_user_id()
     and (ca.selesai is null or ca.selesai >= current_date);
$$;

create or replace function app.boleh_akses_klien(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_mikk_admin()
      or p_org in (select app.my_client_ids());
$$;

-- ---------------------------------------------------------------------
-- Conflict check.
-- security definer: mencocokkan ke SELURUH registri, tapi hanya
-- mengembalikan putusan — bukan daftar. Klien tidak pernah bisa
-- menyimpulkan siapa saja klien firma dari fungsi ini.
-- ---------------------------------------------------------------------
create or replace function app.cek_benturan(p_nama text, p_untuk_org uuid default null)
returns table (putusan text, alasan text)
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_norm text := lower(regexp_replace(coalesce(p_nama,''), '\s+', ' ', 'g'));
  v_hit  int;
begin
  if v_norm = '' then
    return query select 'belum_diperiksa'::text, 'Nama kosong'::text;
    return;
  end if;

  -- kecocokan persis / alias dengan entitas yang juga klien MIKK
  select count(*) into v_hit
    from counterparties c
   where c.is_client
     and (c.client_org_id is distinct from p_untuk_org)
     and (
       lower(c.nama_legal) = v_norm
       or exists (select 1 from unnest(c.nama_alias) a where lower(a) = v_norm)
     );
  if v_hit > 0 then
    return query select 'terbentur'::text,
      'Nama cocok persis dengan entitas yang juga klien retainer MIKK'::text;
    return;
  end if;

  -- kemiripan tinggi: perlu ditinjau manusia, sistem tidak memutuskan sendiri
  select count(*) into v_hit
    from counterparties c
   where c.is_client
     and (c.client_org_id is distinct from p_untuk_org)
     and similarity(lower(c.nama_legal), v_norm) > 0.45;
  if v_hit > 0 then
    return query select 'perlu_tinjauan'::text,
      'Nama mirip dengan klien retainer MIKK — wajib ditinjau Managing Partner'::text;
    return;
  end if;

  select count(*) into v_hit
    from client_orgs o
   where o.id is distinct from p_untuk_org
     and (lower(o.nama_legal) = v_norm or similarity(lower(o.nama_legal), v_norm) > 0.45);
  if v_hit > 0 then
    return query select 'perlu_tinjauan'::text,
      'Nama mirip dengan organisasi klien terdaftar'::text;
    return;
  end if;

  return query select 'aman'::text, 'Tidak ditemukan kecocokan'::text;
end $$;

revoke all on function app.cek_benturan(text, uuid) from public;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table client_orgs          enable row level security;
alter table client_memberships   enable row level security;
alter table client_assignments   enable row level security;
alter table contracts            enable row level security;
alter table contract_categories  enable row level security;
alter table legal_correspondence enable row level security;
alter table permits              enable row level security;
alter table documents            enable row level security;
alter table document_links       enable row level security;
alter table counterparties       enable row level security;
alter table retainer_subscriptions enable row level security;
alter table invoices             enable row level security;
alter table payments             enable row level security;
alter table audit_log            enable row level security;

create policy client_orgs_baca on client_orgs for select
  using (app.boleh_akses_klien(id));
create policy client_orgs_tulis on client_orgs for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy contracts_baca on contracts for select
  using (app.boleh_akses_klien(client_org_id));
create policy contracts_tulis on contracts for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy kategori_baca on contract_categories for select
  using (app.boleh_akses_klien(client_org_id));
create policy kategori_tulis on contract_categories for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy korespondensi_akses on legal_correspondence for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy permits_akses on permits for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy documents_akses on documents for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy document_links_akses on document_links for all
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_akses_klien(d.client_org_id)))
  with check (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_akses_klien(d.client_org_id)));

create policy memberships_baca on client_memberships for select
  using (user_id = app.current_user_id() or app.boleh_akses_klien(client_org_id));
create policy memberships_tulis on client_memberships for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy assignments_baca on client_assignments for select
  using (user_id = app.current_user_id() or app.is_mikk_admin());
create policy assignments_tulis on client_assignments for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

-- Registri lawan pihak: klien HANYA melihat entitas yang tertaut ke
-- kontraknya sendiri. Membaca seluruh tabel = membocorkan daftar klien firma.
-- Registri lawan pihak: entitas BIASA (bukan klien MIKK) boleh dilihat siapa
-- saja yang terautentikasi — ini penting supaya PIC bisa memilih entitas yang
-- sudah ada alih-alih menulis ejaan baru ("Rasantara" vs "PT Rasantara").
-- Entitas yang JUGA klien MIKK (is_client=true) tetap tersembunyi dari
-- listing kecuali: (a) staf MIKK, atau (b) sudah tertaut ke kontrak/
-- korespondensi klien ini sendiri. Ini mencegah satu klien menjelajahi
-- daftar klien firma lainnya, tapi begitu benar-benar terhubung (lewat
-- app.resolusi_lawan_pihak, lihat di bawah), ia boleh terlihat oleh klien
-- yang memang sudah tahu tentang keterkaitan itu dari datanya sendiri.
create policy counterparties_baca on counterparties for select
  using (
    app.is_mikk_admin()
    or not is_client
    or exists (
      select 1 from contracts c
       where c.counterparty_id = counterparties.id
         and c.client_org_id in (select app.my_client_ids()))
    or exists (
      select 1 from legal_correspondence k
       where k.counterparty_id = counterparties.id
         and k.client_org_id in (select app.my_client_ids()))
  );
create policy counterparties_tulis on counterparties for all
  using (app.is_mikk_admin() or exists (
           select 1 from client_assignments ca
            where ca.user_id = app.current_user_id()
              and (ca.selesai is null or ca.selesai >= current_date)))
  with check (true);

-- Mencari-atau-membuat entitas lawan pihak berdasarkan nama, sebagai
-- SECURITY DEFINER. Ini menyelesaikan ketegangan antara dua kebutuhan:
--   1) PIC harus bisa memakai ulang entitas yang sudah ada (termasuk
--      entitas klien MIKK yang TIDAK boleh mereka jelajahi secara bebas),
--      supaya penulisan nama tetap konsisten dan conflict check berfungsi;
--   2) entitas klien MIKK tidak boleh terlihat lewat listing biasa.
-- Fungsi ini bisa MENCOCOKKAN ke entitas is_client=true (karena berjalan
-- dengan hak pemilik, melewati RLS), tapi hanya mengembalikan UUID —
-- bukan detail entitas — persis pola yang sama dengan app.cek_benturan().
create or replace function app.resolusi_lawan_pihak(p_nama text)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_norm text := lower(regexp_replace(coalesce(p_nama,''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if v_norm = '' then return null; end if;

  select id into v_id from counterparties
   where lower(nama_legal) = v_norm
      or exists (select 1 from unnest(nama_alias) a where lower(a) = v_norm)
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into counterparties (nama_legal, created_by)
  values (trim(p_nama), app.current_user_id())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function app.resolusi_lawan_pihak(text) from public;

-- Keuangan: klien melihat miliknya sendiri; angka pendapatan firma
-- HANYA untuk Managing Partner & admin. Associate tidak melihat apa pun.
create policy subs_baca on retainer_subscriptions for select
  using (app.is_mikk_admin() or client_org_id in (select app.my_client_ids()));
create policy subs_tulis on retainer_subscriptions for all
  using (app.is_managing_partner()) with check (app.is_managing_partner());

create policy invoices_baca on invoices for select
  using (app.is_mikk_admin() or client_org_id in (select app.my_client_ids()));
create policy invoices_tulis on invoices for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy payments_akses on payments for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy audit_baca on audit_log for select
  using (app.is_mikk_admin() or app.boleh_akses_klien(client_org_id));

-- Penetapan tarif adalah keputusan bisnis, bukan pekerjaan administrasi.
alter table service_rates enable row level security;
create policy rates_baca on service_rates for select using (true);
create policy rates_tulis on service_rates for all
  using (app.is_managing_partner()) with check (app.is_managing_partner());

-- =====================================================================
--  STATUS TERHITUNG (P1)
--  security_invoker = true agar RLS tabel dasar tetap berlaku
--  saat view dibaca (PostgreSQL 15+).
-- =====================================================================

create or replace view v_contracts_display
with (security_invoker = true) as
select
  c.*,
  cat.nama as kategori_nama,
  cp.nama_legal as lawan_pihak,

  case when c.tanpa_batas_waktu or c.tanggal_berakhir is null
       then null
       else c.tanggal_berakhir - current_date
  end as sisa_hari,

  exists (
    select 1 from contracts x
     where x.parent_contract_id = c.id
       and x.relasi_ke_induk in ('perpanjangan','penggantian')
       and x.status_siklus = 'aktif'
  ) as sudah_digantikan,

  case
    when c.status_siklus <> 'aktif'                              then 'tidak_dipantau'
    when exists (select 1 from contracts x
                  where x.parent_contract_id = c.id
                    and x.relasi_ke_induk in ('perpanjangan','penggantian')
                    and x.status_siklus = 'aktif')               then 'digantikan'
    when c.tanpa_batas_waktu or c.tanggal_berakhir is null       then 'tanpa_batas'
    when c.tanggal_berakhir <  current_date                      then 'kedaluwarsa'
    when c.tanggal_berakhir <= current_date + 30                 then 'kritis'
    when c.tanggal_berakhir <= current_date + 90                 then 'peringatan'
    when c.tanggal_berakhir <= current_date + 180                then 'pantau'
    else 'aman'
  end as status_waktu,

  ( (c.counterparty_id is not null)::int
  + (c.tanggal_mulai is not null)::int
  + ((c.tanggal_berakhir is not null or c.tanpa_batas_waktu))::int
  + ((c.nilai_kontrak is not null or c.nilai_tidak_relevan))::int
  + ((c.nomor_dokumen is not null and c.nomor_dokumen <> ''))::int
  )::numeric / 5 as skor_kelengkapan
from contracts c
left join contract_categories cat on cat.id = c.kategori_id
left join counterparties      cp  on cp.id  = c.counterparty_id;

comment on view v_contracts_display is
  'Satu-satunya sumber status waktu. Semua layar wajib membaca dari sini '
  'agar angka kartu ringkasan dan tabel tidak pernah bertentangan.';

create or replace view v_permits_display
with (security_invoker = true) as
select
  p.*,
  case when p.tanpa_batas_waktu or p.tanggal_kedaluwarsa is null
       then null else p.tanggal_kedaluwarsa - current_date end as sisa_hari,
  case
    when p.status_siklus <> 'aktif'                             then 'tidak_dipantau'
    when p.tanpa_batas_waktu or p.tanggal_kedaluwarsa is null   then 'tanpa_batas'
    when p.tanggal_kedaluwarsa <  current_date                  then 'kedaluwarsa'
    when p.tanggal_kedaluwarsa <= current_date + 30             then 'kritis'
    when p.tanggal_kedaluwarsa <= current_date + 60             then 'peringatan'
    when p.tanggal_kedaluwarsa <= current_date + 180            then 'pantau'
    else 'aman'
  end as status_waktu
from permits p;

-- Gap analysis digerakkan KBLI klien, bukan daftar tetap.
create or replace view v_permit_gap
with (security_invoker = true) as
select
  o.id   as client_org_id,
  pt.id  as permit_type_id,
  pt.kode, pt.nama, pt.instansi, pt.wajib
from client_orgs o
join permit_types pt
  on pt.masih_berlaku
 and (cardinality(pt.kbli_terkait) = 0 or pt.kbli_terkait && o.kbli)
where not exists (
  select 1 from permits p
   where p.client_org_id = o.id
     and p.permit_type_id = pt.id
     and p.status_siklus in ('aktif','dalam_pengurusan')
);

-- Kartu ringkasan dashboard. Definisi terkunci di sini supaya setiap layar
-- memakai angka yang sama.
create or replace view v_dashboard_kontrak
with (security_invoker = true) as
select
  client_org_id,
  count(*) filter (where status_siklus <> 'dibatalkan' and not sudah_digantikan) as total_kontrak,
  count(*) filter (where status_waktu in
        ('aman','pantau','peringatan','kritis','tanpa_batas'))                   as kontrak_aktif,
  count(*) filter (where status_waktu in ('kritis','peringatan'))                as akan_berakhir_90h,
  count(*) filter (where status_waktu = 'kedaluwarsa')                           as kedaluwarsa,
  count(*) filter (where status_waktu = 'digantikan')                            as sudah_diperpanjang,
  coalesce(sum(nilai_kontrak) filter (where status_waktu in
        ('aman','pantau','peringatan','kritis','tanpa_batas')), 0)               as total_nilai,
  count(*) filter (where nilai_kontrak is not null)                              as jumlah_bernilai,
  round(avg(skor_kelengkapan) * 100, 1)                                          as kelengkapan_persen
from v_contracts_display
group by client_org_id;
