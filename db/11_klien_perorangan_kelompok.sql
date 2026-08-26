-- =====================================================================
--  KLIEN PERORANGAN & KLIEN KELOMPOK (BARENG-BARENG)
--  Jalankan setelah 10_fase3_seed_kupon.sql
--
--  client_orgs memodelkan klien retainer korporat (KBLI, tanggal retainer,
--  dst — lihat 01_schema.sql). Perkara untuk individu, atau untuk
--  sekelompok individu yang bersama-sama jadi satu pihak (mis. warga
--  menggugat bersama), tidak punya tempat di sana tanpa memalsukan mereka
--  jadi organisasi. Migration ini menambah dua jenis pemilik perkara baru
--  SEBAGAI TABEL TERPISAH (bukan kolom tipe di client_orgs), lalu membuat
--  `cases` dan `documents` bisa merujuk salah satu dari TIGA jenis pemilik:
--  client_orgs (retainer), individual_clients (perorangan), atau
--  client_groups (kelompok) — persis satu, ditegakkan lewat num_nonnulls().
-- =====================================================================

create table individual_clients (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  nik        text,
  npwp       text,
  alamat     text,
  no_hp      text,
  email      text,
  catatan    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_groups (
  id            uuid primary key default gen_random_uuid(),
  nama_kelompok text not null,
  catatan       text,
  created_at    timestamptz not null default now()
);

-- Kelompok = kumpulan individu yang tercatat sebagai satu pihak dalam
-- perkara (mis. "Warga RT 04" beranggotakan beberapa individual_clients).
create table client_group_members (
  client_group_id      uuid not null references client_groups(id) on delete cascade,
  individual_client_id uuid not null references individual_clients(id) on delete cascade,
  peran_dalam_kelompok text,
  primary key (client_group_id, individual_client_id)
);

-- ---------------------------------------------------------------------
-- cases: pemilik jadi salah satu dari tiga jenis (bukan cuma client_orgs)
-- ---------------------------------------------------------------------
alter table cases alter column client_org_id drop not null;
alter table cases add column individual_client_id uuid references individual_clients(id);
alter table cases add column client_group_id       uuid references client_groups(id);
alter table cases add constraint cases_satu_pemilik check (
  num_nonnulls(client_org_id, individual_client_id, client_group_id) = 1
);
create index cases_individual on cases (individual_client_id);
create index cases_group      on cases (client_group_id);

-- cases_nomor_unik (01_schema/06_fase2) hanya menegakkan keunikan nomor per
-- client_org_id. Tambahkan padanannya untuk dua jenis pemilik baru.
create unique index cases_nomor_unik_indiv on cases (individual_client_id, nomor_perkara)
  where individual_client_id is not null;
create unique index cases_nomor_unik_grup on cases (client_group_id, nomor_perkara)
  where client_group_id is not null;

-- ---------------------------------------------------------------------
-- documents: dokumen boleh melekat ke klien perorangan/kelompok juga
-- ---------------------------------------------------------------------
alter table documents alter column client_org_id drop not null;
alter table documents add column individual_client_id uuid references individual_clients(id);
alter table documents add column client_group_id       uuid references client_groups(id);
alter table documents add constraint documents_satu_pemilik check (
  num_nonnulls(client_org_id, individual_client_id, client_group_id) = 1
);
create index documents_individual on documents (individual_client_id);
create index documents_group      on documents (client_group_id);

-- ---------------------------------------------------------------------
-- client_assignments: satu tabel penugasan PIC/pendukung/supervisi dipakai
-- ulang untuk ketiga jenis pemilik, bukan bikin tabel penugasan baru.
-- ---------------------------------------------------------------------
alter table client_assignments alter column client_org_id drop not null;
alter table client_assignments add column individual_client_id uuid references individual_clients(id);
alter table client_assignments add column client_group_id       uuid references client_groups(id);
alter table client_assignments add constraint assignments_satu_pemilik check (
  num_nonnulls(client_org_id, individual_client_id, client_group_id) = 1
);

create unique index client_assignments_unik_indiv
  on client_assignments (individual_client_id, user_id, mulai) where individual_client_id is not null;
create unique index client_assignments_unik_grup
  on client_assignments (client_group_id, user_id, mulai) where client_group_id is not null;

create unique index client_assignments_satu_pic_utama_indiv
  on client_assignments (individual_client_id)
  where peran = 'pic_utama' and selesai is null and individual_client_id is not null;
create unique index client_assignments_satu_pic_utama_grup
  on client_assignments (client_group_id)
  where peran = 'pic_utama' and selesai is null and client_group_id is not null;

-- ---------------------------------------------------------------------
-- v_cases_display / v_cases_dashboard (07_fase2_rls_views.sql) dibuat
-- SEBELUM kolom individual_client_id/client_group_id ada di atas —
-- `select c.*` di dalam definisi view membekukan daftar kolom PADA SAAT
-- view dibuat, bukan mengikuti tabel dasar secara hidup. Tanpa membuat
-- ulang view ini, kolom pemilik baru tidak akan pernah muncul di sana.
-- CREATE OR REPLACE tidak bisa dipakai untuk ini (kolom baru akan
-- tersisip di TENGAH daftar kolom lama, bukan di akhir, yang ditolak
-- Postgres) — jadi drop+create ulang, sama persis isinya dengan 07,
-- supaya cuma daftar kolomnya yang berubah.
-- ---------------------------------------------------------------------
drop view if exists v_cases_dashboard cascade;
drop view if exists v_cases_display cascade;

create view v_cases_display
with (security_invoker = true) as
select
  c.*,
  h.id as sidang_terdekat_id,
  h.tanggal_sidang as sidang_terdekat_tanggal,
  h.jam_sidang as sidang_terdekat_jam,
  h.agenda as sidang_terdekat_agenda,
  case when h.tanggal_sidang is null then null
       else h.tanggal_sidang - current_date end as hari_ke_sidang,
  (select count(*) from hearings x where x.case_id = c.id) as total_sidang,
  (select count(*) from hearing_minutes m where m.case_id = c.id) as total_minutes
from cases c
left join lateral (
  select * from hearings hh
   where hh.case_id = c.id and hh.status in ('terjadwal','berlangsung')
     and hh.tanggal_sidang >= current_date
   order by hh.tanggal_sidang, hh.jam_sidang
   limit 1
) h on true;

create view v_cases_dashboard
with (security_invoker = true) as
select
  client_org_id,
  count(*) filter (where status_siklus = 'aktif')                        as perkara_aktif,
  count(*) filter (where sidang_terdekat_tanggal = current_date)         as sidang_hari_ini,
  count(*) filter (where hari_ke_sidang between 0 and 7)                 as sidang_7_hari,
  count(*) filter (where tahap in ('kasasi','pk'))                       as tahap_tertinggi
from v_cases_display
group by client_org_id;

grant select on v_cases_display, v_cases_dashboard to mikk_app;
