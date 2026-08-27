-- =====================================================================
--  MASTER DATA — OPSI DROPDOWN TERKELOLA
--  Jalankan setelah 16_hapus_local_auth.sql
--
--  Mengganti opsi "isi sendiri" bebas ketik (db/13_opsi_bebas_isi_sendiri.sql)
--  dengan daftar yang dikelola admin lewat halaman Master Data
--  (server/routes/master-data.routes.js). CHECK constraint yang sudah
--  dilonggarkan di 13 SENGAJA tidak dibalik ke daftar tertutup lagi —
--  Postgres tidak bisa memvalidasi CHECK terhadap tabel lain tanpa
--  trigger, dan itu kerumitan yang tidak sepadan di sini. Penegakan
--  "hanya boleh dari daftar resmi" ada di lapisan UI (dropdown biasa,
--  bukan input teks bebas) — opsi_master ini yang jadi sumber
--  kebenarannya, bukan lagi array hardcode di tiap route /reference.
--
--  kategori = satu per kombinasi tabel+kolom (BUKAN per nama kolom saja
--  — status_siklus ada di cases/contracts/permits, harus terpisah supaya
--  tidak tercampur).
-- =====================================================================

create table opsi_master (
  id         uuid primary key default gen_random_uuid(),
  kategori   text not null,
  kode       text not null,
  label_id   text not null,
  label_en   text,
  urutan     integer not null default 0,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kategori, kode)
);

-- ---------------------------------------------------------------------
-- Seed: nilai default SAMA PERSIS dengan array hardcode yang sebelumnya
-- ada di tiap endpoint /reference, supaya migrasi ini tidak mengubah
-- perilaku aplikasi — cuma memindah sumber datanya dari kode ke tabel.
-- ---------------------------------------------------------------------
insert into opsi_master (kategori, kode, label_id, label_en, urutan) values
  ('cases_tahap', 'pendaftaran',  'Pendaftaran',  'Filing',        1),
  ('cases_tahap', 'mediasi',      'Mediasi',      'Mediation',     2),
  ('cases_tahap', 'persidangan',  'Persidangan',  'Trial',         3),
  ('cases_tahap', 'pembuktian',   'Pembuktian',   'Evidence',      4),
  ('cases_tahap', 'putusan',      'Putusan',      'Verdict',       5),
  ('cases_tahap', 'banding',      'Banding',      'Appeal',        6),
  ('cases_tahap', 'kasasi',       'Kasasi',       'Cassation',     7),
  ('cases_tahap', 'pk',           'PK',           'Judicial Review', 8),
  ('cases_tahap', 'selesai',      'Selesai',      'Closed',        9),

  ('cases_peran_klien', 'penggugat', 'Penggugat', 'Plaintiff',        1),
  ('cases_peran_klien', 'tergugat',  'Tergugat',  'Defendant',        2),
  ('cases_peran_klien', 'pemohon',   'Pemohon',   'Petitioner',       3),
  ('cases_peran_klien', 'termohon',  'Termohon',  'Respondent',       4),
  ('cases_peran_klien', 'pelapor',   'Pelapor',   'Complainant',      5),
  ('cases_peran_klien', 'terlapor',  'Terlapor',  'Reported party',   6),
  ('cases_peran_klien', 'lainnya',   'Lainnya',   'Other',            7),

  ('cases_status_siklus', 'aktif',   'Aktif',   'Active', 1),
  ('cases_status_siklus', 'selesai', 'Selesai', 'Closed', 2),
  ('cases_status_siklus', 'dicabut', 'Dicabut', 'Withdrawn', 3),

  ('contracts_status_siklus', 'draf',          'Draf',          'Draft',        1),
  ('contracts_status_siklus', 'dalam_review',  'Dalam review',  'In review',    2),
  ('contracts_status_siklus', 'aktif',         'Aktif',         'Active',       3),
  ('contracts_status_siklus', 'selesai',       'Selesai',       'Completed',    4),
  ('contracts_status_siklus', 'dibatalkan',    'Dibatalkan',    'Cancelled',    5),
  ('contracts_status_siklus', 'diputus',       'Diputus',       'Terminated',   6),
  ('contracts_status_siklus', 'digantikan',    'Digantikan',    'Superseded',   7),

  ('contracts_jenis_dokumen', 'PKS',       'PKS',       'PKS',       1),
  ('contracts_jenis_dokumen', 'SPK',       'SPK',       'SPK',       2),
  ('contracts_jenis_dokumen', 'MOU',       'MOU',       'MOU',       3),
  ('contracts_jenis_dokumen', 'NDA',       'NDA',       'NDA',       4),
  ('contracts_jenis_dokumen', 'Addendum',  'Addendum',  'Addendum',  5),
  ('contracts_jenis_dokumen', 'Amandemen', 'Amandemen', 'Amendment', 6),
  ('contracts_jenis_dokumen', 'PKWT',      'PKWT',      'PKWT',      7),
  ('contracts_jenis_dokumen', 'SP',        'SP',        'SP',        8),
  ('contracts_jenis_dokumen', 'BAST',      'BAST',      'BAST',      9),
  ('contracts_jenis_dokumen', 'Lainnya',   'Lainnya',   'Other',     10),

  ('contracts_relasi_ke_induk', 'perpanjangan', 'Perpanjangan', 'Renewal',      1),
  ('contracts_relasi_ke_induk', 'addendum',     'Addendum',     'Addendum',     2),
  ('contracts_relasi_ke_induk', 'amandemen',    'Amandemen',    'Amendment',    3),
  ('contracts_relasi_ke_induk', 'penggantian',  'Penggantian',  'Replacement',  4),

  ('permits_status_siklus', 'aktif',              'Aktif',              'Active',           1),
  ('permits_status_siklus', 'dalam_pengurusan',   'Dalam pengurusan',   'In progress',      2),
  ('permits_status_siklus', 'dicabut',            'Dicabut',            'Revoked',          3),
  ('permits_status_siklus', 'tidak_berlaku_lagi',  'Tidak berlaku lagi', 'No longer valid',  4),

  ('legal_projects_status', 'berjalan',   'Berjalan',   'In progress', 1),
  ('legal_projects_status', 'selesai',    'Selesai',    'Completed',   2),
  ('legal_projects_status', 'tertunda',   'Tertunda',   'On hold',     3),
  ('legal_projects_status', 'dibatalkan', 'Dibatalkan', 'Cancelled',   4),

  ('pendampingan_jenis', 'mediasi',       'Mediasi',              'Mediation',        1),
  ('pendampingan_jenis', 'negosiasi',     'Negosiasi',            'Negotiation',      2),
  ('pendampingan_jenis', 'due_diligence', 'Due Diligence',        'Due Diligence',    3),
  ('pendampingan_jenis', 'audit',         'Pendampingan Audit',   'Audit Assistance', 4),
  ('pendampingan_jenis', 'lainnya',       'Lainnya',              'Other',            5),

  ('pendampingan_status', 'menunggu',   'Menunggu',   'Pending',     1),
  ('pendampingan_status', 'diproses',   'Diproses',   'In progress', 2),
  ('pendampingan_status', 'selesai',    'Selesai',    'Completed',   3),
  ('pendampingan_status', 'dibatalkan', 'Dibatalkan', 'Cancelled',   4);

alter table opsi_master enable row level security;

-- Baca boleh siapa saja yang terautentikasi — ini bukan data rahasia
-- klien, cuma daftar preset dropdown yang sama untuk semua orang.
create policy opsi_master_baca on opsi_master for select using (true);
create policy opsi_master_tulis on opsi_master for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());

grant select, insert, update, delete on opsi_master to mikk_app;
