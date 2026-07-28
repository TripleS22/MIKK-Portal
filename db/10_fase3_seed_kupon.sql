-- =====================================================================
--  FASE 3 — KUPON CONTOH
--
--  TARIF TIDAK DISEED DI SINI. Ketiga tarif konsultasi (online
--  Rp 500.000/jam, offline Bandung Rp 1.000.000, luar kota "menyesuaikan")
--  SUDAH ada sejak 03_seed_nhc.sql dengan kode KONSUL_ONLINE,
--  KONSUL_OFFLINE_BDG, dan KONSUL_LUAR_KOTA. Menambahkannya lagi di sini
--  hanya akan menghasilkan dua baris harga untuk layanan yang sama —
--  persoalan yang jauh lebih mahal daripada kelihatannya, karena booking
--  lama menunjuk ke baris tarif yang mana pun yang kebetulan terpilih.
--
--  Harga adalah keputusan bisnis: ubah lewat service_rates, bukan di kode.
--
--  Catatan terbuka yang dibawa dari 03_seed_nhc.sql dan BELUM terjawab:
--  satuan KONSUL_OFFLINE_BDG disetel 'per_sesi' mengikuti brief, sementara
--  mockup menulis "/1 Jam". Perlu konfirmasi Pak Irfan sebelum rilis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Kupon contoh untuk pengujian alur pemesanan.
-- WAJIB dinonaktifkan atau diganti sebelum portal dibuka ke publik —
-- kode yang mudah ditebak berarti konsultasi gratis bagi siapa saja.
-- ---------------------------------------------------------------------
insert into coupons (kode, deskripsi, tipe, nilai, jenis_layanan, kuota, berlaku_sampai)
values
  ('MIKKPERDANA', 'Diskon 50% konsultasi pertama', 'persen', 50, '{}', 100,
   current_date + interval '180 days'),
  ('KONSULGRATIS', 'Konsultasi online gratis — undangan Managing Partner', 'gratis', null,
   '{konsultasi_online}', 25, current_date + interval '90 days')
on conflict (kode) do nothing;
