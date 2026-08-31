-- =====================================================================
--  PERAN SISI KLIEN — 'viewer' BENAR-BENAR BACA-SAJA
--  Jalankan setelah 18_client_orgs_edit_klien.sql
--
--  Ditemukan sambil membenahi kejelasan drawer edit pengguna: kolom
--  client_memberships.peran ('admin_klien' | 'legal_manager' | 'viewer')
--  SELAMA INI cuma dipakai untuk satu hal (app.boleh_edit_klien, profil
--  perusahaan). Untuk seluruh tabel operasional (contracts, permits,
--  cases, hearings, hearing_minutes, legal_projects,
--  pendampingan_requests, documents, document_links,
--  legal_correspondence, contract_categories), kebijakan tulisnya
--  memakai app.boleh_akses_klien() -- fungsi yang SAMA dipakai kebijakan
--  baca -- jadi ketiga peran itu (termasuk 'viewer') sama-sama boleh
--  insert/update/delete. Nama perannya menjanjikan sesuatu yang tidak
--  ditegakkan sama sekali.
--
--  Migrasi ini menambah app.boleh_tulis_klien(): sama seperti
--  boleh_akses_klien (is_mikk_admin, ATAU staf yang ditugaskan lewat
--  client_assignments -- TIDAK berubah, staf tetap penuh seperti
--  sebelumnya), TAPI untuk sisi klien (client_memberships) HANYA
--  admin_klien/legal_manager yang lolos -- viewer tidak.
--
--  Pola per tabel: kebijakan BACA (select) yang sudah ada/baru dibuat
--  TETAP memakai boleh_akses_klien (siapa saja anggota org, termasuk
--  viewer, tetap bisa lihat) -- yang diganti/dipersempit HANYA
--  kebijakan tulis (insert/update/delete), dari boleh_akses_klien
--  menjadi boleh_tulis_klien. RLS meng-OR-kan kebijakan permisif untuk
--  perintah yang sama, jadi menambah kebijakan _baca baru di tabel yang
--  sebelumnya cuma punya satu kebijakan gabungan ("_akses") TIDAK
--  mengurangi apa pun yang sudah bisa dibaca -- cuma menyempurnakan
--  bahwa baca tidak lagi "kebetulan lolos" lewat kebijakan tulis yang
--  sama.
-- =====================================================================

create or replace function app.boleh_tulis_klien(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select
    app.is_mikk_admin()
    or exists (
      select 1 from client_assignments ca
       where ca.client_org_id = p_org
         and ca.user_id = app.current_user_id()
         and (ca.selesai is null or ca.selesai >= current_date))
    or exists (
      select 1 from client_memberships cm
       where cm.client_org_id = p_org
         and cm.user_id = app.current_user_id()
         and cm.peran in ('admin_klien','legal_manager')
         and cm.aktif);
$$;
revoke all on function app.boleh_tulis_klien(uuid) from public;
grant execute on function app.boleh_tulis_klien(uuid) to mikk_app;

-- ---------------------------------------------------------------------
-- Tabel yang SUDAH punya kebijakan _baca (select) terpisah -- cukup
-- persempit kebijakan _tulis-nya saja.
-- ---------------------------------------------------------------------
drop policy contracts_tulis on contracts;
create policy contracts_tulis on contracts for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

drop policy kategori_tulis on contract_categories;
create policy kategori_tulis on contract_categories for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

-- ---------------------------------------------------------------------
-- Tabel yang sebelumnya cuma punya SATU kebijakan gabungan ("_akses",
-- for all) -- dipecah jadi _baca (boleh_akses_klien, tidak berubah
-- cakupannya) + _tulis (boleh_tulis_klien, baru, lebih sempit).
-- ---------------------------------------------------------------------
create policy korespondensi_baca on legal_correspondence for select
  using (app.boleh_akses_klien(client_org_id));
drop policy korespondensi_akses on legal_correspondence;
create policy korespondensi_tulis on legal_correspondence for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

create policy permits_baca on permits for select
  using (app.boleh_akses_klien(client_org_id));
drop policy permits_akses on permits;
create policy permits_tulis on permits for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

create policy documents_baca on documents for select
  using (app.boleh_akses_klien(client_org_id));
drop policy documents_akses on documents;
create policy documents_tulis on documents for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

create policy document_links_baca on document_links for select
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_akses_klien(d.client_org_id)));
drop policy document_links_akses on document_links;
create policy document_links_tulis on document_links for all
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_tulis_klien(d.client_org_id)))
  with check (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and app.boleh_tulis_klien(d.client_org_id)));

create policy cases_baca on cases for select
  using (app.boleh_akses_klien(client_org_id));
drop policy cases_akses on cases;
create policy cases_tulis on cases for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

create policy hearings_baca on hearings for select
  using (exists (select 1 from cases c where c.id = hearings.case_id
                   and app.boleh_akses_klien(c.client_org_id)));
drop policy hearings_akses on hearings;
create policy hearings_tulis on hearings for all
  using (exists (select 1 from cases c where c.id = hearings.case_id
                   and app.boleh_tulis_klien(c.client_org_id)))
  with check (exists (select 1 from cases c where c.id = hearings.case_id
                        and app.boleh_tulis_klien(c.client_org_id)));

create policy hearing_minutes_baca on hearing_minutes for select
  using (exists (select 1 from cases c where c.id = hearing_minutes.case_id
                   and app.boleh_akses_klien(c.client_org_id)));
drop policy hearing_minutes_akses on hearing_minutes;
create policy hearing_minutes_tulis on hearing_minutes for all
  using (exists (select 1 from cases c where c.id = hearing_minutes.case_id
                   and app.boleh_tulis_klien(c.client_org_id)))
  with check (exists (select 1 from cases c where c.id = hearing_minutes.case_id
                        and app.boleh_tulis_klien(c.client_org_id)));

create policy legal_projects_baca on legal_projects for select
  using (app.boleh_akses_klien(client_org_id));
drop policy legal_projects_akses on legal_projects;
create policy legal_projects_tulis on legal_projects for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

create policy pendampingan_baca on pendampingan_requests for select
  using (app.boleh_akses_klien(client_org_id));
drop policy pendampingan_akses on pendampingan_requests;
create policy pendampingan_tulis on pendampingan_requests for all
  using (app.boleh_tulis_klien(client_org_id))
  with check (app.boleh_tulis_klien(client_org_id));

-- counterparties_tulis SENGAJA TIDAK disentuh -- itu registri lawan
-- pihak lintas klien, hak tulisnya sudah lewat client_assignments (staf),
-- bukan client_memberships.peran, jadi di luar lingkup migrasi ini.
-- invoices/payments (Fase 3, belum dipakai endpoint mana pun) juga
-- sengaja tidak disentuh -- akan ditinjau saat modul itu benar-benar
-- dibangun.
