-- =====================================================================
--  FASE 2 — Litigasi & Sidang, Proyek Legal, Hub Pendampingan
--  Jalankan setelah 05_app_role.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- LITIGASI & SIDANG
-- ---------------------------------------------------------------------
create table cases (
  id              uuid primary key default gen_random_uuid(),
  client_org_id   uuid not null references client_orgs(id) on delete cascade,
  nomor_perkara   text not null,
  jenis_perkara   text,                          -- "Perdata - Wanprestasi", "Pidana - Penggelapan"
  peran_klien     text check (peran_klien in
                    ('penggugat','tergugat','pemohon','termohon','pelapor','terlapor','lainnya')),
  lawan_pihak_teks text,                         -- ringkasan para pihak lawan (bisa lebih dari satu)
  pengadilan      text,
  tahap           text not null default 'pendaftaran' check (tahap in
                    ('pendaftaran','mediasi','persidangan','pembuktian','putusan','banding','kasasi','pk','selesai')),
  status_siklus   text not null default 'aktif' check (status_siklus in ('aktif','selesai','dicabut')),
  tanggal_daftar  date,
  pic_legal_id    uuid references users(id),
  keterangan      text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index cases_org on cases (client_org_id);
create unique index cases_nomor_unik on cases (client_org_id, nomor_perkara);

create table hearings (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id) on delete cascade,
  tanggal_sidang date not null,
  jam_sidang    time,
  agenda        text,
  status        text not null default 'terjadwal' check (status in
                  ('terjadwal','berlangsung','selesai','ditunda','dibatalkan')),
  created_at    timestamptz not null default now()
);
create index hearings_case on hearings (case_id);
create index hearings_tanggal on hearings (tanggal_sidang);

create table hearing_minutes (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id) on delete cascade,
  hearing_id    uuid references hearings(id) on delete set null,
  isi           text not null,
  status        text not null default 'draf' check (status in ('draf','final')),
  dicatat_oleh  uuid references users(id),
  created_at    timestamptz not null default now()
);
create index hearing_minutes_case on hearing_minutes (case_id);

-- ---------------------------------------------------------------------
-- PROYEK LEGAL DEPARTEMEN
-- ---------------------------------------------------------------------
create table legal_projects (
  id              uuid primary key default gen_random_uuid(),
  client_org_id   uuid not null references client_orgs(id) on delete cascade,
  nama_proyek     text not null,
  kategori        text,                          -- Korporasi, Ketenagakerjaan, Restrukturisasi, dst — teks bebas
  pic_legal_id    uuid references users(id),
  progress_persen integer not null default 0 check (progress_persen between 0 and 100),
  status          text not null default 'berjalan' check (status in
                    ('berjalan','selesai','tertunda','dibatalkan')),
  target_selesai  date,
  keterangan      text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index legal_projects_org on legal_projects (client_org_id);

-- ---------------------------------------------------------------------
-- HUB PENDAMPINGAN
-- ---------------------------------------------------------------------
create table pendampingan_requests (
  id              uuid primary key default gen_random_uuid(),
  client_org_id   uuid not null references client_orgs(id) on delete cascade,
  jenis           text not null check (jenis in
                    ('mediasi','negosiasi','due_diligence','audit','lainnya')),
  tanggal_kegiatan date,
  lokasi          text,
  pihak_terlibat  text,
  deskripsi       text,
  status          text not null default 'menunggu' check (status in
                    ('menunggu','diproses','selesai','dibatalkan')),
  pic_id          uuid references users(id),
  requested_by    uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pendampingan_org on pendampingan_requests (client_org_id);

-- ---------------------------------------------------------------------
-- Trigger updated_at + audit (pola sama dengan tabel Fase 1)
-- ---------------------------------------------------------------------
create trigger trg_touch_cases before update on cases
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_legal_projects before update on legal_projects
  for each row execute function app.fn_touch_updated_at();
create trigger trg_touch_pendampingan before update on pendampingan_requests
  for each row execute function app.fn_touch_updated_at();

create trigger trg_audit_cases after insert or update or delete on cases
  for each row execute function app.fn_audit();
create trigger trg_audit_legal_projects after insert or update or delete on legal_projects
  for each row execute function app.fn_audit();
create trigger trg_audit_pendampingan after insert or update or delete on pendampingan_requests
  for each row execute function app.fn_audit();
