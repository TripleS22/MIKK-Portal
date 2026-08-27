-- =====================================================================
--  JENIS IZIN (permit_types) DIKELOLA LEWAT APLIKASI
--  Jalankan setelah 20_document_links_pendampingan.sql
--
--  permit_types SEBELUMNYA cuma bisa diisi lewat migrasi/seed SQL —
--  tidak ada rute API sama sekali untuk menambah/mengubahnya, jadi tidak
--  ikut halaman Master Data walau secara konsep sama-sama "opsi yang
--  ditawarkan di dropdown" (di sini: dropdown "Jenis Izin" pada modul
--  Perizinan). TIDAK dipindah ke tabel generik opsi_master (db/17) —
--  permit_types punya kolom yang tidak dimiliki kategori lain (instansi,
--  masa_berlaku_bulan dipakai menghitung perkiraan kedaluwarsa,
--  kbli_terkait dipakai v_permit_gap untuk gap analysis per sektor,
--  wajib) — memaksakannya ke opsi_master berarti kehilangan kolom-kolom
--  itu atau membengkakkan opsi_master dengan kolom yang tidak relevan
--  untuk kategori lain. Diberi RLS sendiri, pola yang SAMA dengan
--  opsi_master: baca bebas (bukan data rahasia klien), tulis admin-only.
--
--  masih_berlaku dipakai sebagai "aktif/nonaktif" (sudah ada sejak
--  01_schema.sql, awalnya untuk TDP yang dilebur ke NIB) — TIDAK ada
--  hapus keras di sini, sama prinsipnya dengan opsi_master: jenis izin
--  yang sudah pernah dipakai (permits.permit_type_id) tidak boleh jadi
--  yatim kalau dinonaktifkan.
-- =====================================================================

alter table permit_types enable row level security;

create policy permit_types_baca on permit_types for select using (true);
create policy permit_types_tulis on permit_types for all
  using (app.is_mikk_admin()) with check (app.is_mikk_admin());
