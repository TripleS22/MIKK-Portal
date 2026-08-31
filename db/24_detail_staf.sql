-- =====================================================================
--  db/24 — PERBAIKAN REGRESI migrasi 23 (klien perorangan/kelompok
--  kehilangan akses ke perkara & dokumennya sendiri) + fondasi halaman
--  "Detail Staf" (perkara yang ditangani, dokumen, riwayat, foto profil).
--  Jalankan setelah 23_viewer_readonly_enforcement.sql.
--
--  BUG YANG DIPERBAIKI: migrasi 23 (viewer read-only) menimpa kebijakan
--  cases_akses / documents_akses / document_links_akses -- yang
--  SEBELUMNYA (migrasi 12) memakai app.boleh_akses_pihak(), fungsi yang
--  menghitung akses lewat TIGA jalur pemilik (client_org_id,
--  individual_client_id, client_group_id) -- dengan versi baru yang
--  cuma memeriksa client_org_id. Akibatnya: perkara/dokumen milik
--  klien PERORANGAN atau KELOMPOK (client_org_id NULL) jadi cuma bisa
--  diakses is_mikk_admin() -- staf PIC/legal biasa yang ditugaskan
--  lewat client_assignments kehilangan akses ke perkara/dokumen
--  kliennya sendiri. Diperbaiki dengan menghitung ulang lewat fungsi
--  "pihak"-aware (boleh_tulis_pihak, versi TULIS dari boleh_akses_pihak
--  yang sudah ada sejak migrasi 12), bukan balik memakai fungsi
--  org-only. Cakupan bug ini HANYA cases/documents/document_links --
--  tabel lain yang disentuh migrasi 23 (contracts, permits, dst.)
--  memang selalu org-only sejak awal (lihat catatan migrasi 12),
--  tidak kena regresi ini.
-- =====================================================================

create or replace function app.boleh_tulis_pihak(p_org uuid, p_indiv uuid, p_grup uuid)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select
    app.is_mikk_admin()
    or (p_org is not null and app.boleh_tulis_klien(p_org))
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
revoke all on function app.boleh_tulis_pihak(uuid, uuid, uuid) from public;
grant execute on function app.boleh_tulis_pihak(uuid, uuid, uuid) to mikk_app;

drop policy if exists cases_baca on cases;
drop policy if exists cases_tulis on cases;
create policy cases_baca on cases for select
  using (app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id));
create policy cases_tulis on cases for all
  using (app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id))
  with check (app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id));

-- documents: pemilik ke-4 -- STAF (bukan klien sama sekali). Dokumen
-- staf (CV, KTP, sertifikat, dst. -- halaman Detail Staf) admin-only
-- murni, tidak ada jalur "PIC ditugaskan" (ini bukan data klien).
alter table documents add column if not exists staff_user_id uuid references users(id) on delete cascade;
alter table documents drop constraint if exists documents_satu_pemilik;
alter table documents add constraint documents_satu_pemilik check (
  num_nonnulls(client_org_id, individual_client_id, client_group_id, staff_user_id) = 1
);
create index if not exists documents_staff on documents (staff_user_id);

drop policy if exists documents_baca on documents;
drop policy if exists documents_tulis on documents;
create policy documents_baca on documents for select
  using (
    app.boleh_akses_pihak(client_org_id, individual_client_id, client_group_id)
    or (staff_user_id is not null and app.is_mikk_admin())
  );
create policy documents_tulis on documents for all
  using (
    app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)
    or (staff_user_id is not null and app.is_mikk_admin())
  )
  with check (
    app.boleh_tulis_pihak(client_org_id, individual_client_id, client_group_id)
    or (staff_user_id is not null and app.is_mikk_admin())
  );

drop policy if exists document_links_baca on document_links;
drop policy if exists document_links_tulis on document_links;
create policy document_links_baca on document_links for select
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and (app.boleh_akses_pihak(d.client_org_id, d.individual_client_id, d.client_group_id)
            or (d.staff_user_id is not null and app.is_mikk_admin()))));
create policy document_links_tulis on document_links for all
  using (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and (app.boleh_tulis_pihak(d.client_org_id, d.individual_client_id, d.client_group_id)
            or (d.staff_user_id is not null and app.is_mikk_admin()))))
  with check (exists (
    select 1 from documents d
     where d.id = document_links.document_id
       and (app.boleh_tulis_pihak(d.client_org_id, d.individual_client_id, d.client_group_id)
            or (d.staff_user_id is not null and app.is_mikk_admin()))));

-- ---------------------------------------------------------------------
-- Riwayat staf -- catatan bertanggal yang bisa DITAMBAH admin (bukan
-- diedit/dihapus -- ini riwayat/log, bukan status yang berubah-ubah).
-- ---------------------------------------------------------------------
create table staff_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  isi        text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index staff_notes_user on staff_notes (user_id, created_at desc);
alter table staff_notes enable row level security;
create policy staff_notes_akses on staff_notes for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());
grant select, insert, update, delete on staff_notes to mikk_app;

-- Foto profil staf -- kolom sederhana di users (path storage, sama
-- pola dengan documents.storage_path), BUKAN lewat tabel documents --
-- ini bukan "dokumen" yang bisa dihapus/diarsip, cuma satu foto
-- terkini per orang.
alter table users add column if not exists foto_path text;
