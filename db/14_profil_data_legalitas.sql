-- =====================================================================
--  PROFIL PER PERAN — DATA LEGALITAS STAF
--  Jalankan setelah 13_opsi_bebas_isi_sendiri.sql
--
--  Layar "Profil Saya" (server/routes/profile.routes.js) menampilkan data
--  legalitas milik peran yang sedang login. Sisi klien sudah punya data
--  itu di client_orgs (npwp, nib, alamat) — tidak perlu kolom baru. Sisi
--  staf MIKK belum punya tempat untuk nomor izin advokat/NIK/alamat
--  pribadi, jadi ditambahkan di sini.
-- =====================================================================

alter table mikk_staff add column nomor_izin_advokat text;
alter table mikk_staff add column nik                text;
alter table mikk_staff add column alamat              text;
