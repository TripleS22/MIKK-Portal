-- =====================================================================
--  LAMPIRAN DOKUMEN UNTUK HUB PENDAMPINGAN
--  Jalankan setelah 19_dokumen_publik_fungsi.sql
--
--  document_links.entity_type awalnya cuma mengenal
--  ('contract','permit','case','project','correspondence','client_org').
--  Sekarang setiap modul (termasuk Hub Pendampingan) punya panel lampiran
--  dokumen sendiri (lihat renderLampiranPanel di public/js/app.js) — 'pendampingan'
--  ditambahkan sebagai jenis entitas sendiri, BUKAN dipaksakan memakai
--  'correspondence' yang secara makna berbeda (itu untuk surat-menyurat).
-- =====================================================================

alter table document_links drop constraint if exists document_links_entity_type_check;
alter table document_links add constraint document_links_entity_type_check
  check (entity_type in ('contract','permit','case','project','correspondence','client_org','pendampingan'));
