-- =====================================================================
--  db/25 — HAK AKSES PER PENGGUNA, DIATUR ADMIN/SUPER ADMIN
--  Jalankan setelah 24_detail_staf.sql.
--
--  Diminta: admin/super admin bisa mengatur hak akses ke informasi
--  SECARA PER ORANG (bukan cuma per peran) -- mis. satu Legal Manager
--  tertentu boleh dibatasi tidak melihat Litigasi & Sidang, atau satu
--  PIC tertentu diberi akses tambahan ke Proyek Legal walau perannya
--  biasanya tidak dapat itu.
--
--  Desain: tabel permission_overrides (satu baris per user+modul) di
--  ATAS aturan peran yang SUDAH ADA (boleh_akses_klien/boleh_tulis_klien/
--  boleh_akses_pihak/boleh_tulis_pihak dari migrasi 02/12/23) -- BUKAN
--  menggantikannya. Kalau tidak ada override utk user+modul tertentu,
--  perilaku SAMA PERSIS seperti sebelum migrasi ini (aturan peran biasa
--  yang berlaku). Override baru dipakai kalau memang sengaja diset admin.
--
--  is_mikk_admin() SELALU bisa lompat override (tidak pernah bisa
--  mengunci diri sendiri lewat override yang salah) -- override cuma
--  memengaruhi pengguna NON-admin (staf biasa maupun klien).
--
--  Modul yang bisa diatur SENGAJA dibatasi ke modul sisi-klien saja
--  (kontrak/permits/cases/projects/pendampingan/docs) -- modul admin-
--  only (Master Data/Tarif/Staf MIKK/Klien Baru) tetap murni is_mikk_
--  admin(), tidak butuh override per orang (kalau ingin memberi HAK
--  admin ke orang lain, itu ubah jabatan mikk_staff, bukan override).
-- =====================================================================

create table permission_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  modul       text not null check (modul in ('kontrak','permits','cases','projects','pendampingan','docs')),
  boleh_lihat boolean not null default true,
  boleh_tulis boolean not null default true,
  catatan     text,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  unique (user_id, modul)
);
create index permission_overrides_user on permission_overrides (user_id);
comment on table permission_overrides is
  'Pengecualian PER ORANG di atas aturan peran biasa -- lihat catatan db/25. '
  'Tidak ada baris = pakai aturan peran seperti biasa (tidak berubah).';

alter table permission_overrides enable row level security;
-- Baca: pemiliknya sendiri (supaya UI-nya sendiri tahu apa yang
-- disembunyikan/dikunci untuknya) ATAU admin (layar kelola).
create policy permission_overrides_baca on permission_overrides for select
  using (user_id = app.current_user_id() or app.is_mikk_admin());
-- Tulis: admin/super admin SAJA -- ini justru fitur "admin yang atur".
create policy permission_overrides_tulis on permission_overrides for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());
grant select, insert, update, delete on permission_overrides to mikk_app;

create or replace function app.override_lihat(p_modul text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select boleh_lihat from permission_overrides
   where user_id = app.current_user_id() and modul = p_modul;
$$;
create or replace function app.override_tulis(p_modul text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select boleh_tulis from permission_overrides
   where user_id = app.current_user_id() and modul = p_modul;
$$;
revoke all on function app.override_lihat(text) from public;
revoke all on function app.override_tulis(text) from public;
grant execute on function app.override_lihat(text) to mikk_app;
grant execute on function app.override_tulis(text) to mikk_app;

-- ---------------------------------------------------------------------
-- kontrak: contracts, contract_categories, legal_correspondence
-- ---------------------------------------------------------------------
drop policy contracts_baca on contracts;
drop policy contracts_tulis on contracts;
create policy contracts_baca on contracts for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('kontrak'), app.boleh_akses_klien(client_org_id)));
create policy contracts_tulis on contracts for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)));

drop policy kategori_baca on contract_categories;
drop policy kategori_tulis on contract_categories;
create policy kategori_baca on contract_categories for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('kontrak'), app.boleh_akses_klien(client_org_id)));
create policy kategori_tulis on contract_categories for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)));

drop policy korespondensi_baca on legal_correspondence;
drop policy korespondensi_tulis on legal_correspondence;
create policy korespondensi_baca on legal_correspondence for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('kontrak'), app.boleh_akses_klien(client_org_id)));
create policy korespondensi_tulis on legal_correspondence for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('kontrak'), app.boleh_tulis_klien(client_org_id)));

-- ---------------------------------------------------------------------
-- permits
-- ---------------------------------------------------------------------
drop policy permits_baca on permits;
drop policy permits_tulis on permits;
create policy permits_baca on permits for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('permits'), app.boleh_akses_klien(client_org_id)));
create policy permits_tulis on permits for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('permits'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('permits'), app.boleh_tulis_klien(client_org_id)));

-- ---------------------------------------------------------------------
-- cases, hearings, hearing_minutes -- pemilik bisa org/individu/kelompok
-- ---------------------------------------------------------------------
drop policy cases_baca on cases;
drop policy cases_tulis on cases;
create policy cases_baca on cases for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('cases'), app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id)));
create policy cases_tulis on cases for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)));

drop policy hearings_baca on hearings;
drop policy hearings_tulis on hearings;
create policy hearings_baca on hearings for select
  using (exists (select 1 from cases c where c.id = hearings.case_id
    and (app.is_mikk_admin() or coalesce(app.override_lihat('cases'), app.boleh_akses_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))));
create policy hearings_tulis on hearings for all
  using (exists (select 1 from cases c where c.id = hearings.case_id
    and (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))))
  with check (exists (select 1 from cases c where c.id = hearings.case_id
    and (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))));

drop policy hearing_minutes_baca on hearing_minutes;
drop policy hearing_minutes_tulis on hearing_minutes;
create policy hearing_minutes_baca on hearing_minutes for select
  using (exists (select 1 from cases c where c.id = hearing_minutes.case_id
    and (app.is_mikk_admin() or coalesce(app.override_lihat('cases'), app.boleh_akses_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))));
create policy hearing_minutes_tulis on hearing_minutes for all
  using (exists (select 1 from cases c where c.id = hearing_minutes.case_id
    and (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))))
  with check (exists (select 1 from cases c where c.id = hearing_minutes.case_id
    and (app.is_mikk_admin() or coalesce(app.override_tulis('cases'), app.boleh_tulis_pihak(c.client_org_id, c.individual_client_id, c.client_group_id)))));

-- ---------------------------------------------------------------------
-- legal_projects
-- ---------------------------------------------------------------------
drop policy legal_projects_baca on legal_projects;
drop policy legal_projects_tulis on legal_projects;
create policy legal_projects_baca on legal_projects for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('projects'), app.boleh_akses_klien(client_org_id)));
create policy legal_projects_tulis on legal_projects for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('projects'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('projects'), app.boleh_tulis_klien(client_org_id)));

-- ---------------------------------------------------------------------
-- pendampingan_requests
-- ---------------------------------------------------------------------
drop policy pendampingan_baca on pendampingan_requests;
drop policy pendampingan_tulis on pendampingan_requests;
create policy pendampingan_baca on pendampingan_requests for select
  using (app.is_mikk_admin() or coalesce(app.override_lihat('pendampingan'), app.boleh_akses_klien(client_org_id)));
create policy pendampingan_tulis on pendampingan_requests for all
  using (app.is_mikk_admin() or coalesce(app.override_tulis('pendampingan'), app.boleh_tulis_klien(client_org_id)))
  with check (app.is_mikk_admin() or coalesce(app.override_tulis('pendampingan'), app.boleh_tulis_klien(client_org_id)));

-- ---------------------------------------------------------------------
-- documents, document_links -- HANYA cabang org/individu/kelompok yang
-- diberi override ('docs'); cabang staff_user_id (dokumen internal staf,
-- lihat db/24) SENGAJA TIDAK disentuh -- itu bukan "dokumen klien",
-- tetap admin-only murni tanpa pengecualian.
-- ---------------------------------------------------------------------
drop policy documents_baca on documents;
drop policy documents_tulis on documents;
create policy documents_baca on documents for select
  using (
    app.is_mikk_admin()
    or (staff_user_id is null and coalesce(app.override_lihat('docs'), app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id)))
  );
create policy documents_tulis on documents for all
  using (
    app.is_mikk_admin()
    or (staff_user_id is null and coalesce(app.override_tulis('docs'), app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)))
  )
  with check (
    app.is_mikk_admin()
    or (staff_user_id is null and coalesce(app.override_tulis('docs'), app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)))
  );

drop policy document_links_baca on document_links;
drop policy document_links_tulis on document_links;
create policy document_links_baca on document_links for select
  using (exists (select 1 from documents d where d.id = document_links.document_id
    and (app.is_mikk_admin()
      or (d.staff_user_id is null and coalesce(app.override_lihat('docs'), app.boleh_akses_pihak(d.client_org_id, d.individual_client_id, d.client_group_id))))));
create policy document_links_tulis on document_links for all
  using (exists (select 1 from documents d where d.id = document_links.document_id
    and (app.is_mikk_admin()
      or (d.staff_user_id is null and coalesce(app.override_tulis('docs'), app.boleh_tulis_pihak(d.client_org_id, d.individual_client_id, d.client_group_id))))))
  with check (exists (select 1 from documents d where d.id = document_links.document_id
    and (app.is_mikk_admin()
      or (d.staff_user_id is null and coalesce(app.override_tulis('docs'), app.boleh_tulis_pihak(d.client_org_id, d.individual_client_id, d.client_group_id))))));
