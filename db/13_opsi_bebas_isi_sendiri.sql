-- =====================================================================
--  OPSI "ISI SENDIRI" PADA DROPDOWN STATUS/TAHAP/JENIS
--  Jalankan setelah 12_klien_perorangan_kelompok_rls.sql
--
--  Kolom status/tahap/jenis operasional di bawah tadinya dikunci ke
--  daftar tetap lewat CHECK (col in (...)). Pengguna ingin bisa isi nilai
--  baru sendiri lewat UI ("Lainnya… isi sendiri"), bukan cuma memilih
--  dari preset. Kolom tetap wajib diisi (tidak boleh string kosong),
--  tapi tidak lagi dibatasi ke daftar tertutup. Daftar "resmi" tetap
--  hidup di endpoint /reference tiap modul, dipakai sebagai preset
--  dropdown + label i18n — bukan lagi ditegakkan database.
--
--  SENGAJA TIDAK disentuh: kolom yang menentukan hak akses/identitas
--  peran — mikk_staff.jabatan, client_memberships.peran,
--  client_assignments.peran — itu bukan "isi sendiri", itu keputusan HR/
--  kontrol akses.
-- =====================================================================

alter table cases drop constraint if exists cases_tahap_check;
alter table cases add constraint cases_tahap_check check (btrim(tahap) <> '');

alter table cases drop constraint if exists cases_peran_klien_check;
alter table cases add constraint cases_peran_klien_check
  check (peran_klien is null or btrim(peran_klien) <> '');

alter table cases drop constraint if exists cases_status_siklus_check;
alter table cases add constraint cases_status_siklus_check check (btrim(status_siklus) <> '');

alter table hearings drop constraint if exists hearings_status_check;
alter table hearings add constraint hearings_status_check check (btrim(status) <> '');

alter table hearing_minutes drop constraint if exists hearing_minutes_status_check;
alter table hearing_minutes add constraint hearing_minutes_status_check check (btrim(status) <> '');

alter table contracts drop constraint if exists contracts_status_siklus_check;
alter table contracts add constraint contracts_status_siklus_check check (btrim(status_siklus) <> '');

alter table permits drop constraint if exists permits_status_siklus_check;
alter table permits add constraint permits_status_siklus_check check (btrim(status_siklus) <> '');

alter table legal_projects drop constraint if exists legal_projects_status_check;
alter table legal_projects add constraint legal_projects_status_check check (btrim(status) <> '');

alter table pendampingan_requests drop constraint if exists pendampingan_requests_jenis_check;
alter table pendampingan_requests add constraint pendampingan_requests_jenis_check check (btrim(jenis) <> '');

alter table pendampingan_requests drop constraint if exists pendampingan_requests_status_check;
alter table pendampingan_requests add constraint pendampingan_requests_status_check check (btrim(status) <> '');
