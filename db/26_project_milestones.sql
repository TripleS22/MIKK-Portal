-- db/26_project_milestones.sql
--
-- TAHAPAN PROYEK — progres proyek dihitung, bukan diketik.
--
-- Dilaporkan langsung: formulir Edit Proyek punya slider "Progress: 60%"
-- yang bisa digeser bebas ke angka berapa pun. Artinya angka itu tidak
-- mengukur apa-apa — dia cuma pendapat orang yang terakhir membuka
-- formulirnya. Padahal justru angka inilah yang dilihat klien di kartu
-- perjalanan sebagai "sudah sampai mana proyek saya".
--
-- Jadi progres sekarang punya PARAMETER: daftar tahapan proyek yang bisa
-- dicentang. progress_persen = tahapan selesai / total tahapan, dihitung
-- trigger di bawah, tidak bisa diketik dari UI lagi.
--
-- Kolom legal_projects.progress_persen SENGAJA DIPERTAHANKAN (bukan
-- diganti view/kolom hasil hitungan) supaya seluruh pembacanya yang
-- sudah ada -- v_legal_projects_display (select p.*),
-- v_legal_projects_dashboard, kartu & tabel di UI -- tetap jalan tanpa
-- perubahan apa pun. Yang berubah cuma SIAPA yang mengisinya: dulu
-- formulir, sekarang trigger.
--
-- Proyek LAMA yang belum punya tahapan sama sekali tetap memakai angka
-- yang tersimpan sekarang (trigger cuma jalan kalau ada perubahan
-- tahapan) -- jadi migrasi ini tidak mengosongkan progres proyek yang
-- sudah berjalan. Begitu tahapan pertamanya ditambahkan, angkanya
-- langsung diambil alih hasil hitungan.

create table if not exists project_milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references legal_projects(id) on delete cascade,
  nama            text not null check (length(btrim(nama)) > 0),
  urutan          integer not null default 0,
  selesai         boolean not null default false,
  tanggal_selesai date,
  created_at      timestamptz not null default now()
);
create index if not exists project_milestones_project on project_milestones (project_id, urutan, created_at);

alter table project_milestones enable row level security;

-- Baca: cukup "proyeknya kelihatan oleh saya". Subquery ke legal_projects
-- IKUT disaring policy legal_projects_baca (mikk_app bukan pemilik tabel
-- dan tidak BYPASSRLS), jadi aturan siapa boleh melihat proyek tidak
-- perlu ditulis ulang di sini -- dan otomatis ikut kalau nanti berubah.
drop policy if exists project_milestones_baca on project_milestones;
create policy project_milestones_baca on project_milestones for select
  using (exists (select 1 from legal_projects p where p.id = project_milestones.project_id));

-- Tulis: "boleh kelihatan" tidak sama dengan "boleh diubah", jadi syarat
-- tulisnya ditulis eksplisit -- sama persis dengan legal_projects_tulis
-- (lihat db/25_permission_overrides.sql).
drop policy if exists project_milestones_tulis on project_milestones;
create policy project_milestones_tulis on project_milestones for all
  using (exists (
    select 1 from legal_projects p
     where p.id = project_milestones.project_id
       and (app.is_mikk_admin() or coalesce(app.override_tulis('projects'), app.boleh_tulis_klien(p.client_org_id)))))
  with check (exists (
    select 1 from legal_projects p
     where p.id = project_milestones.project_id
       and (app.is_mikk_admin() or coalesce(app.override_tulis('projects'), app.boleh_tulis_klien(p.client_org_id)))));

grant select, insert, update, delete on project_milestones to mikk_app;

-- Trigger penghitung. SENGAJA BUKAN security definer: siapa pun yang
-- lolos project_milestones_tulis pasti juga lolos legal_projects_tulis
-- (syaratnya disalin persis di atas), jadi update di bawah tidak perlu
-- hak tambahan -- dan tidak membuka jalur menulis legal_projects tanpa
-- lewat RLS-nya.
create or replace function app.hitung_progres_proyek() returns trigger
language plpgsql as $$
declare
  v_project uuid;
  v_total   integer;
  v_selesai integer;
begin
  v_project := coalesce(new.project_id, old.project_id);
  select count(*), count(*) filter (where selesai)
    into v_total, v_selesai
    from project_milestones where project_id = v_project;
  update legal_projects
     set progress_persen = case when v_total = 0 then 0
                                else round(v_selesai::numeric * 100 / v_total) end,
         updated_at = now()
   where id = v_project;
  return null;
end $$;

drop trigger if exists project_milestones_progres on project_milestones;
create trigger project_milestones_progres
  after insert or update or delete on project_milestones
  for each row execute function app.hitung_progres_proyek();
