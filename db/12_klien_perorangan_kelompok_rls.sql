-- =====================================================================
--  RLS — KLIEN PERORANGAN & KLIEN KELOMPOK
--  Jalankan setelah 11_klien_perorangan_kelompok.sql
--
--  app.boleh_akses_klien() (02_rls_dan_views.sql) TETAP dipakai apa
--  adanya oleh contracts/permits/legal_projects/pendampingan_requests —
--  modul-modul itu tetap org-only, sesuai lingkup permintaan. Hanya
--  `cases` dan `documents` yang perlu bisa dimiliki klien perorangan/
--  kelompok, jadi hanya kebijakan keduanya (+ document_links +
--  client_assignments) yang diganti di sini, lewat fungsi generik baru
--  app.boleh_akses_pihak().
-- =====================================================================

create or replace function app.boleh_akses_pihak(p_org uuid, p_indiv uuid, p_grup uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select
    app.is_mikk_admin()
    or (p_org is not null and app.boleh_akses_klien(p_org))
    or (p_indiv is not null and exists (
          select 1 from client_assignments ca
           where ca.individual_client_id = p_indiv
             and ca.user_id = app.current_user_id()
             and (ca.selesai is null or ca.selesai >= current_date)))
    or (p_grup is not null and exists (
          select 1 from client_assignments ca
           where ca.client_group_id = p_grup
             and ca.user_id = app.current_user_id()
             and (ca.selesai is null or ca.selesai >= current_date)));
$$;
revoke all on function app.boleh_akses_pihak(uuid, uuid, uuid) from public;
grant execute on function app.boleh_akses_pihak(uuid, uuid, uuid) to mikk_app;

-- ---------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------
drop policy if exists cases_akses on cases;
create policy cases_akses on cases for all
  using (app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id))
  with check (app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id));

-- ---------------------------------------------------------------------
-- documents & document_links
-- ---------------------------------------------------------------------
drop policy if exists documents_akses on documents;
create policy documents_akses on documents for all
  using (app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id))
  with check (app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id));

drop policy if exists document_links_akses on document_links;
create policy document_links_akses on document_links for all
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_akses_pihak(d.client_org_id, d.individual_client_id, d.client_group_id)))
  with check (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_akses_pihak(d.client_org_id, d.individual_client_id, d.client_group_id)));

-- ---------------------------------------------------------------------
-- client_assignments — baca: milik sendiri, atau admin. Tulis tetap
-- admin-only lewat assignments_tulis yang sudah ada di 02 (tidak berubah).
-- ---------------------------------------------------------------------
drop policy if exists assignments_baca on client_assignments;
create policy assignments_baca on client_assignments for select
  using (user_id = app.current_user_id() or app.is_mikk_admin());

-- ---------------------------------------------------------------------
-- individual_clients / client_groups / client_group_members
-- Baca: admin, atau staf yang punya penugasan aktif ke entitas itu.
-- Tulis: admin saja — sama seperti client_orgs_tulis di 02.
-- ---------------------------------------------------------------------
alter table individual_clients   enable row level security;
alter table client_groups        enable row level security;
alter table client_group_members enable row level security;

create policy individual_clients_baca on individual_clients for select
  using (app.is_mikk_admin() or exists (
    select 1 from client_assignments ca
     where ca.individual_client_id = individual_clients.id
       and ca.user_id = app.current_user_id()
       and (ca.selesai is null or ca.selesai >= current_date)));
create policy individual_clients_tulis on individual_clients for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy client_groups_baca on client_groups for select
  using (app.is_mikk_admin() or exists (
    select 1 from client_assignments ca
     where ca.client_group_id = client_groups.id
       and ca.user_id = app.current_user_id()
       and (ca.selesai is null or ca.selesai >= current_date)));
create policy client_groups_tulis on client_groups for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

create policy client_group_members_baca on client_group_members for select
  using (app.is_mikk_admin() or exists (
    select 1 from client_assignments ca
     where ca.client_group_id = client_group_members.client_group_id
       and ca.user_id = app.current_user_id()
       and (ca.selesai is null or ca.selesai >= current_date)));
create policy client_group_members_tulis on client_group_members for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

-- Grant eksplisit — jaga-jaga bila urutan migrasi berubah (default
-- privileges dari 05_app_role.sql seharusnya sudah cukup, sama seperti
-- catatan di 07_fase2_rls_views.sql).
grant select, insert, update, delete
  on individual_clients, client_groups, client_group_members to mikk_app;
