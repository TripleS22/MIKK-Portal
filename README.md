# MIKK Client Portal — Fase 1 (CRM Kontrak)

Aplikasi fullstack sungguhan: PostgreSQL asli + Node.js/Express di backend,
halaman web statis (tanpa framework build step) di frontend. Ini bukan
mockup — setiap fitur di bawah sudah diuji lewat HTTP dan lewat browser
sungguhan (Playwright), bukan hanya dibaca kodenya.

Dokumen acuan: `SPESIFIKASI_MODEL_DATA_MIKK_PORTAL.md` (di percakapan
sebelumnya). Proyek ini adalah implementasi Bagian 1–12 spesifikasi itu
untuk modul CRM Kontrak, plus autentikasi dan pemilihan workspace.

---

## Isi proyek

```
mikk-portal/
├── db/                       Skema SQL — jalankan berurutan (lihat migrate.js)
│   ├── 01_schema.sql         25+ tabel, constraint, indeks, trigger audit
│   ├── 00_local_auth.sql     Tabel kata sandi lokal (pengganti Supabase Auth)
│   ├── 02_rls_dan_views.sql  RLS, conflict check, view status terhitung
│   ├── 03_seed_nhc.sql       104 kontrak NHC hasil migrasi & pembersihan
│   ├── 05_app_role.sql       Peran database non-superuser untuk server
│   ├── 06_fase2_schema.sql   Tabel cases, hearings, legal_projects, pendampingan
│   └── 07_fase2_rls_views.sql RLS & view status terhitung untuk Fase 2
├── server/
│   ├── lib/db.js             Koneksi Postgres + penegakan konteks pengguna
│   ├── lib/auth.js           JWT + hashing kata sandi
│   ├── middleware/authenticate.js
│   ├── routes/                auth, contracts, counterparties, permits,
│   │                          client-orgs, cases, legal-projects,
│   │                          pendampingan, documents
│   ├── scripts/migrate.js    Menjalankan db/*.sql berurutan
│   ├── scripts/seed.js       Membuat kata sandi akun demo
│   ├── app.js                 Perakitan Express
│   └── index.js               Titik masuk
├── uploads/                   Berkas dokumen fisik (di luar direktori statis —
│                               lihat catatan keamanan di documents.routes.js)
└── public/                   Frontend statis — dilayani langsung oleh Express
    ├── index.html             Enam modul dalam satu halaman + pemilih modul
    ├── css/style.css
    └── js/api.js, app.js
```

---

## Dua koneksi database, bukan satu — WAJIB dibaca sebelum menjalankan

Ini bagian paling penting dari seluruh proyek ini, dan penyebab bug paling
berbahaya yang saya temukan dan perbaiki saat membangun ini.

**Masalahnya:** PostgreSQL membebaskan *superuser* dan *pemilik tabel* dari
Row Level Security, apa pun kebijakan yang didefinisikan. Kalau server
aplikasi terhubung ke database memakai akun yang sama dengan yang dipakai
untuk migrasi (superuser), maka **seluruh RLS yang dibangun di
`02_rls_dan_views.sql` tidak pernah benar-benar aktif** — setiap query akan
melihat semua baris dari semua klien, terlepas dari kebijakan apa pun yang
tertulis. Yang berbahaya: tidak ada error, tidak ada gejala. Semuanya
terlihat berfungsi normal sampai ada insiden kebocoran data antar klien
yang sesungguhnya.

Saya sempat membuat kesalahan ini sendiri saat pertama membangun proyek ini
— server berjalan lewat akun `postgres`, dan pengujian isolasi antar klien
"lulus" secara kebetulan (karena saat itu belum ada data klien kedua untuk
benar-benar diuji). Begitu saya tambahkan kontrak uji milik klien kedua,
baru terlihat bahwa PIC klien pertama bisa melihatnya lewat API — RLS tidak
pernah bekerja. Perbaikannya:

- **`DATABASE_URL`** — dipakai HANYA oleh `npm run migrate` dan
  `npm run seed`. Butuh privilese tinggi (CREATE TABLE, CREATE EXTENSION,
  CREATE ROLE). Ini akun superuser/admin.
- **`APP_DATABASE_URL`** — dipakai SERVER saat runtime, lewat peran
  `mikk_app` yang dibuat otomatis oleh `05_app_role.sql`. Peran ini bukan
  superuser dan bukan pemilik tabel, sehingga RLS benar-benar berlaku.

`server/lib/db.js` **menolak menyala** kalau `APP_DATABASE_URL` tidak diset
— ini disengaja, supaya kesalahan ini tidak bisa terjadi diam-diam lagi.

Di Supabase, masalah ini tidak akan muncul: koneksi dari aplikasi klien
(lewat Supabase client library atau PostgREST) selalu memakai peran
`authenticated`/`anon`, bukan superuser. Bagian ini hanya relevan karena
proyek ini dirancang bisa berjalan di luar Supabase juga.

---

## Menjalankan secara lokal

### 1. Siapkan PostgreSQL

```bash
# Ubuntu/Debian
apt-get install postgresql postgresql-contrib

# atau pakai Docker
docker run -d --name mikk-pg -e POSTGRES_PASSWORD=mikkdev -p 5544:5432 postgres:16
```

Buat database kosong:

```sql
create database mikk_portal;
```

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Isi `DATABASE_URL` dengan koneksi superuser ke database yang baru dibuat.
`APP_DATABASE_URL` **boleh dibiarkan seperti contoh** untuk pertama kali —
peran `mikk_app` dan kata sandinya akan dibuat otomatis oleh migrasi.
**Ganti kata sandi peran itu** (di `db/05_app_role.sql` dan `.env`) sebelum
dipakai di luar komputer pengembangan.

Ganti juga `JWT_SECRET` — jangan pakai nilai contoh:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Pasang dependensi, migrasi, seed

```bash
npm install
npm run migrate   # menjalankan db/*.sql berurutan, termasuk membuat peran mikk_app
npm run seed      # membuat kata sandi untuk akun demo
```

### 4. Jalankan

```bash
npm run dev
```

Buka `http://localhost:4000`.

### Akun demo (kata sandi sama untuk semua: `MikkDemo!2026`)

| Email | Peran | Yang terlihat |
|---|---|---|
| `irfan@mikklaws.com` | Managing Partner | Semua klien (NHC & RCP) |
| `putri@mikklaws.com` | Associate | Hanya klien yang ditugaskan padanya (RCP) |
| `legal@nhc.co.id` | Legal Manager (sisi klien) | Hanya NHC |

**Ganti atau hapus akun-akun ini sebelum rilis produksi.** `seed.js` murni
alat pengembangan — di produksi, pembuatan pengguna dan kata sandi
seharusnya lewat alur registrasi/undangan yang sebenarnya (atau Supabase
Auth, bila migrasi ke sana).

---

## Yang sudah selesai dan teruji sungguhan

Enam modul, semuanya dengan backend Express + PostgreSQL asli, RLS aktif,
dan frontend yang mengonsumsi API sungguhan — bukan mockup:

| Modul | Isi |
|---|---|
| **CRM Kontrak** | Peta kelengkapan data, mode isi cepat, resolusi lawan pihak + conflict check langsung saat mengetik, status waktu terhitung |
| **Manajemen Perizinan** | Kartu ringkasan, tabel, formulir, Gap Analysis digerakkan KBLI klien |
| **Litigasi & Sidang** | Daftar perkara, jadwal sidang (sidang terdekat + hari-ke-sidang dihitung otomatis), hearing minutes |
| **Proyek Legal Departemen** | Progress bar, status waktu (segera selesai / terlambat dihitung dari target) |
| **Hub Pendampingan** | Permintaan mediasi/negosiasi/due diligence/audit, tombol WhatsApp langsung |
| **Arsip Dokumen Digital** | Unggah/unduh berkas privat per klien, diverifikasi RLS sebelum satu byte pun terkirim |

### Bug nyata yang ditemukan dan diperbaiki selama pengembangan

Dua temuan penting yang layak diketahui siapa pun yang melanjutkan proyek
ini — keduanya jenis bug yang **tidak terlihat sampai benar-benar diuji**:

**1. Server sempat terhubung sebagai superuser Postgres**, yang membebaskan
diri dari RLS sepenuhnya. Uji isolasi antar klien awalnya "lulus" secara
kebetulan (belum ada data klien kedua). Perbaikan: dua koneksi database
terpisah — lihat bagian "Dua koneksi database, bukan satu" di bawah.

**2. Semua kolom bertipe `date` tampil sebagai "Invalid Date" di frontend**
begitu benar-benar berisi tanggal. Penyebabnya: `node-pg` mengonversi
kolom `date` jadi objek `Date` JavaScript, yang saat di-serialize ke JSON
menjadi string ISO lengkap dengan waktu ("2026-08-08T00:00:00.000Z"),
padahal frontend mengasumsikan menerima "YYYY-MM-DD" polos. Baru terlihat
saat menguji baris yang benar-benar punya tanggal berakhir — baris yang
kosong menyembunyikan bug ini di layar-layar sebelumnya. Diperbaiki sekali
di `server/lib/db.js` lewat `types.setTypeParser(1082, ...)`, bukan
ditambal di satu-satu titik pemakaian.

Kedua temuan ini alasan kenapa setiap klaim "sudah selesai" di proyek ini
disertai bukti pengujian — bukan karena kodenya terlihat benar saat dibaca.

### Hasil uji isolasi antar klien (diulang untuk tabel Fase 2)

| Tabel | Andi (PIC NHC) akses data RCP | Putri (PIC RCP) akses datanya sendiri |
|---|---|---|
| `cases` | 0 baris | 1 baris |
| `legal_projects` | 0 baris | 1 baris |
| `pendampingan_requests` | 0 baris | 1 baris |
| `documents` (unduh langsung) | HTTP 404 | HTTP 200 |

---

## Yang BELUM ada (sengaja, dan alasannya)

**Fase 3 — corong calon klien, pembayaran, voucher — tidak dibangun
sungguhan di sini.** Modul ini butuh akun payment gateway asli (Midtrans/
Xendit dsb.), verifikasi bisnis, dan kredensial produksi. Membangunnya
tanpa itu hanya menghasilkan tampilan yang terlihat berfungsi tapi
sebenarnya palsu — bertentangan dengan prinsip seluruh proyek ini: dibangun
lalu diuji sungguhan, bukan dipoles. Tabelnya **sudah ada** di
`01_schema.sql` (`service_rates`, `retainer_subscriptions`, `invoices`,
`payments`) sesuai Bagian 13 spesifikasi, siap dipakai begitu kredensial
payment gateway tersedia.

**Nomor WhatsApp Managing Partner masih placeholder** (`62800000000`) di
`public/js/app.js` (`muatPendampinganSemua`) — ganti sebelum rilis.

## Peningkatan yang layak dipertimbangkan sebelum produksi

- **Token JWT disimpan di `localStorage`.** Untuk mengurangi risiko XSS,
  pertimbangkan pindah ke cookie `httpOnly` + `secure` sebelum rilis publik.
- **`local_auth` (kata sandi) adalah solusi sementara.** Kalau proyek pindah
  ke Supabase, seluruh isi `00_local_auth.sql` dan `server/lib/auth.js`
  bagian hashing bisa dihapus — Supabase Auth menggantikannya sepenuhnya,
  dan `app.current_user_id()` di `02_rls_dan_views.sql` sudah otomatis
  memakai `auth.uid()` bila tersedia.
- **Rate limiting belum ada** di endpoint `/api/auth/login` — perlu
  ditambahkan sebelum publik (mis. `express-rate-limit`) untuk mencegah
  percobaan kata sandi bertubi-tubi.
- **`migrate.js` bukan sistem migrasi bertahap** — cocok untuk database
  kosong, bukan untuk menerapkan perubahan skema incremental ke database
  yang sudah berisi data produksi. Saat skema mulai berubah setelah go-live,
  ganti dengan `node-pg-migrate` atau serupa.
