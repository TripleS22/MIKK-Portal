-- =====================================================================
--  FASE 2 — RLS & VIEW STATUS TERHITUNG
--  Jalankan setelah 06_fase2_schema.sql
-- =====================================================================

alter table cases              enable row level security;
alter table hearings           enable row level security;
alter table hearing_minutes    enable row level security;
alter table legal_projects     enable row level security;
alter table pendampingan_requests enable row level security;

create policy cases_akses on cases for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

-- hearings & hearing_minutes tidak punya client_org_id sendiri — akses
-- ditentukan lewat perkara induknya, supaya tidak ada dua sumber kebenaran
-- untuk "siapa boleh lihat" (sama seperti document_links di 02).
create policy hearings_akses on hearings for all
  using (exists (select 1 from cases c where c.id = hearings.case_id
                   and app.boleh_akses_klien(c.client_org_id)))
  with check (exists (select 1 from cases c where c.id = hearings.case_id
                        and app.boleh_akses_klien(c.client_org_id)));

create policy hearing_minutes_akses on hearing_minutes for all
  using (exists (select 1 from cases c where c.id = hearing_minutes.case_id
                   and app.boleh_akses_klien(c.client_org_id)))
  with check (exists (select 1 from cases c where c.id = hearing_minutes.case_id
                        and app.boleh_akses_klien(c.client_org_id)));

create policy legal_projects_akses on legal_projects for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

create policy pendampingan_akses on pendampingan_requests for all
  using (app.boleh_akses_klien(client_org_id))
  with check (app.boleh_akses_klien(client_org_id));

-- Hak tulis mikk_app dipasang lewat GRANT tabel-lebar di 05_app_role.sql
-- ("alter default privileges") — tabel Fase 2 ini dibuat SETELAH baris
-- default-privileges itu berjalan, jadi grant-nya sudah otomatis berlaku.
-- Baris di bawah ini eksplisit, jaga-jaga bila urutan migrasi berubah.
grant select, insert, update, delete on cases, hearings, hearing_minutes,
  legal_projects, pendampingan_requests to mikk_app;

-- =====================================================================
-- VIEW STATUS TERHITUNG
-- =====================================================================

-- Sidang terdekat per perkara + hari menuju sidang itu (P1: dihitung,
-- bukan disimpan).
create or replace view v_cases_display
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

create or replace view v_legal_projects_display
with (security_invoker = true) as
select
  p.*,
  case when p.target_selesai is null then null
       else p.target_selesai - current_date end as sisa_hari,
  case
    when p.status <> 'berjalan'                                   then 'tidak_dipantau'
    when p.target_selesai is null                                 then 'tanpa_batas'
    when p.target_selesai < current_date                          then 'terlambat'
    when p.target_selesai <= current_date + 7                     then 'segera_selesai'
    when p.target_selesai <= current_date + 30                    then 'pantau'
    else 'aman'
  end as status_waktu
from legal_projects p;

create or replace view v_cases_dashboard
with (security_invoker = true) as
select
  client_org_id,
  count(*) filter (where status_siklus = 'aktif')                        as perkara_aktif,
  count(*) filter (where sidang_terdekat_tanggal = current_date)         as sidang_hari_ini,
  count(*) filter (where hari_ke_sidang between 0 and 7)                 as sidang_7_hari,
  count(*) filter (where tahap in ('kasasi','pk'))                       as tahap_tertinggi
from v_cases_display
group by client_org_id;

create or replace view v_legal_projects_dashboard
with (security_invoker = true) as
select
  client_org_id,
  count(*)                                                         as total_proyek,
  count(*) filter (where status = 'selesai')                       as selesai,
  count(*) filter (where status = 'berjalan')                      as berjalan,
  count(*) filter (where status = 'tertunda')                      as tertunda,
  count(*) filter (where status_waktu = 'segera_selesai')          as segera_selesai,
  count(*) filter (where status_waktu = 'terlambat')               as terlambat
from v_legal_projects_display
group by client_org_id;
