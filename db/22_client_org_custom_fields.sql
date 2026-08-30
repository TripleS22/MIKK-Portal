-- =====================================================================
--  FIELD KUSTOM PROFIL PERUSAHAAN — bebas per klien
--  Jalankan setelah 21_permit_types_master_data.sql
--
--  Keputusan disengaja (dikonfirmasi pengguna): BUKAN skema terstruktur
--  ala Master Data (field yang sama untuk semua klien) — tiap
--  client_org bisa menambahkan field label:nilai sendiri secara bebas
--  lewat drawer Edit profilnya sendiri, tidak perlu didaftarkan admin
--  dulu. Konsekuensinya: field-nya BISA beda-beda antar klien, dan
--  tidak ada cara "merekap" nilai field yang sama lintas klien (kalau
--  nanti dibutuhkan, itu perubahan desain terpisah, bukan diam-diam
--  ditambahkan di sini).
--
--  Tabel baris (bukan JSONB di client_orgs) — supaya tambah/ubah/hapus/
--  urutkan satu field bisa lewat CRUD baris biasa (pola yang sama
--  dengan opsi_master, db/17), bukan mengarmor-tangani satu kolom JSON
--  besar dari aplikasi.
-- =====================================================================

create table client_org_custom_fields (
  id            uuid primary key default gen_random_uuid(),
  client_org_id uuid not null references client_orgs(id) on delete cascade,
  label         text not null,
  nilai         text,
  urutan        integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index client_org_custom_fields_org on client_org_custom_fields (client_org_id);

create trigger trg_touch_client_org_custom_fields before update on client_org_custom_fields
  for each row execute function app.fn_touch_updated_at();

alter table client_org_custom_fields enable row level security;

-- Baca/tulis mengikuti fungsi yang SAMA dengan client_orgs itu sendiri
-- (app.boleh_akses_klien / app.boleh_edit_klien, db/02 & db/18) — bukan
-- kebijakan baru: siapa pun yang boleh melihat/mengedit profil sebuah
-- organisasi klien, boleh melihat/mengedit field kustomnya juga.
create policy client_org_custom_fields_baca on client_org_custom_fields for select
  using (app.boleh_akses_klien(client_org_id));
create policy client_org_custom_fields_tulis on client_org_custom_fields for all
  using (app.boleh_edit_klien(client_org_id))
  with check (app.boleh_edit_klien(client_org_id));

grant select, insert, update, delete on client_org_custom_fields to mikk_app;
