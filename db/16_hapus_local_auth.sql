-- =====================================================================
--  HAPUS AUTENTIKASI LOKAL — Supabase Auth sudah menggantikannya
--  Jalankan setelah 15_supabase_auth_user_id.sql
--
--  local_auth (db/00_local_auth.sql) adalah stand-in sementara untuk
--  Supabase Auth, dan sekarang sudah tidak ada satu pun kode yang
--  membacanya (server/lib/auth.js lama, server/routes/auth.routes.js,
--  server/routes/client-users.routes.js, server/routes/prospects.routes.js,
--  server/scripts/seed.js — semuanya sudah dipindah ke
--  server/lib/supabase-auth.js). Tabelnya dihapus di sini, bukan
--  dibiarkan menggantung tak terpakai.
-- =====================================================================

drop table if exists local_auth;
