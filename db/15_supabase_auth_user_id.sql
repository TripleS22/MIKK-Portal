-- =====================================================================
--  TAUTAN KE SUPABASE AUTH
--  Jalankan setelah 14_profil_data_legalitas.sql
--
--  Migrasi ke Supabase Auth (menggantikan local_auth + JWT kustom —
--  lihat server/lib/supabase-auth.js) SENGAJA tidak mengubah users.id
--  jadi sama dengan auth.users.id, walau itu rencana awal yang tertulis
--  di komentar 00_local_auth.sql. Alasannya: users.id direferensikan
--  puluhan foreign key di seluruh skema (mikk_staff.user_id, pic_legal_id
--  di kontrak/izin/perkara/proyek, client_memberships, documents.uploaded_by,
--  dst.) — mengubah nilai PK yang sudah ada berarti menulis ulang semua
--  itu, migrasi data yang jauh lebih berisiko daripada perlu.
--
--  Sebagai gantinya: kolom baru auth_user_id menyimpan id akun Supabase
--  Auth terkait (auth.users.id, meski disimpan sebagai uuid biasa —
--  bukan foreign key ke auth.users supaya migrasi ini tetap bisa
--  dijalankan di luar Supabase juga). users.id, dan semua FK yang
--  merujuknya, TIDAK berubah sama sekali.
--
--  Diisi saat: (a) akun baru dibuat (client-users.routes.js,
--  prospects.routes.js langsung mengisi ini saat insert), atau (b) baris
--  lama (dari seed, belum pernah ditautkan) — ditautkan sendiri oleh
--  server/middleware/authenticate.js begitu login pertama berhasil
--  diverifikasi (dicocokkan lewat email sebagai fallback satu kali).
-- =====================================================================

alter table users add column auth_user_id uuid;
create unique index users_auth_user_id_unik on users (auth_user_id) where auth_user_id is not null;
