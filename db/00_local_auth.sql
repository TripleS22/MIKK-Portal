-- =====================================================================
--  AUTENTIKASI LOKAL — PENGGANTI SUPABASE AUTH UNTUK PENGEMBANGAN
--
--  Di produksi (Supabase), login/registrasi/reset password ditangani
--  Supabase Auth, dan users.id disamakan dengan auth.users.id — TIDAK
--  ADA tabel kata sandi di skema aplikasi.
--
--  Tabel di bawah ini HANYA untuk menjalankan sistem di luar Supabase
--  (server sendiri, pengujian lokal, demo). Sigit dapat menghapus berkas
--  ini sepenuhnya saat pindah ke Supabase Auth.
-- =====================================================================

create table local_auth (
  user_id       uuid primary key references users(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

comment on table local_auth is
  'Stand-in untuk Supabase Auth. Tidak dipakai bila auth.uid() tersedia (lihat app.current_user_id()).';
