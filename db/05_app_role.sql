-- =====================================================================
--  PERAN APLIKASI — dipakai SERVER, bukan oleh migrasi
--
--  PENTING: Postgres membebaskan pemilik tabel dan superuser dari RLS,
--  apa pun kebijakannya. Migrasi (01-04) dijalankan sebagai superuser
--  agar bisa membuat tabel, ekstensi, dan kebijakan. Tapi jika SERVER
--  APLIKASI memakai koneksi yang sama, seluruh RLS yang sudah dibangun
--  tidak akan pernah aktif — setiap query akan melihat semua baris,
--  terlepas dari kebijakan apa pun.
--
--  Peran mikk_app di bawah ini BUKAN superuser dan BUKAN pemilik tabel,
--  sehingga RLS berlaku penuh untuknya. server/lib/db.js WAJIB terhubung
--  lewat peran ini (APP_DATABASE_URL) — bukan lewat DATABASE_URL yang
--  dipakai migrate.js.
--
--  Di Supabase, kebutuhan ini sudah otomatis terpenuhi (koneksi PostgREST
--  memakai peran 'authenticated', bukan superuser). Berkas ini hanya
--  relevan saat menjalankan sistem di luar Supabase.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mikk_app') then
    create role mikk_app login password 'ganti_ini_sebelum_produksi';
  end if;
end $$;

grant usage on schema public, app to mikk_app;
grant select, insert, update, delete on all tables in schema public to mikk_app;
grant usage, select on all sequences in schema public to mikk_app;
grant execute on all functions in schema app to mikk_app;

-- Tabel/fungsi baru di masa depan otomatis ikut ter-grant.
alter default privileges in schema public
  grant select, insert, update, delete on tables to mikk_app;
alter default privileges in schema public
  grant usage, select on sequences to mikk_app;
alter default privileges in schema app
  grant execute on functions to mikk_app;
