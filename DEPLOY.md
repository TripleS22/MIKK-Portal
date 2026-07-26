# Menyimpan ke GitHub & Deploy

## Kenapa saya tidak melakukannya sendiri

Saya tidak punya akun GitHub maupun akun hosting apa pun atas nama MIKK.
Mendorong kode ke repositori butuh salah satu dari ini, yang keduanya
milik Bapak/Sigit, bukan saya:

- Repositori GitHub yang sudah dibuat, atau
- Token akses (Personal Access Token) untuk membuatkannya

Saya juga sengaja tidak meminta token itu ditempel di chat — bukan karena
tidak bisa memakainya, tapi karena itu bukan praktik yang aman untuk
kredensial pribadi, meskipun tokennya dibatasi untuk satu repositori.

Yang sudah saya siapkan supaya langkah Bapak tinggal sedikit:

## 1. Menyimpan ke GitHub (3 perintah)

Repositori git **sudah diinisialisasi secara lokal**, lengkap dengan 14
commit yang mencerminkan urutan sungguhan proyek ini dibangun — termasuk
dua commit `fix(security)` yang menjelaskan bug nyata yang ditemukan dan
diperbaiki selama pengembangan.

```bash
cd mikk-portal
git log --oneline          # lihat riwayatnya dulu kalau mau

# Buat repositori KOSONG dulu di github.com (jangan centang "Add README")
# lalu jalankan:
git remote add origin https://github.com/<akun-anda>/mikk-client-portal.git
git branch -M main
git push -u origin main
```

Kalau memakai SSH, ganti URL remote dengan `git@github.com:<akun-anda>/mikk-client-portal.git`.

**Sebaiknya repositori dibuat privat** — isinya kode kelengkapan legal firma,
walau data kliennya sendiri hanya berupa hasil migrasi Excel yang sudah
melalui proses pembersihan, bukan dokumen asli.

## 2. Deploy

### Catatan jujur soal `Dockerfile` dan `docker-compose.yml`

Kedua berkas ini saya tulis mengikuti pola standar (image `node:20-slim`,
`npm ci --omit=dev`, Postgres 16 resmi) dan sintaks YAML-nya sudah
divalidasi. **Tapi saya tidak bisa menjalankan `docker build` maupun
`docker compose up` di lingkungan kerja saya** — Docker tidak terpasang di
sana. Jadi berbeda dengan seluruh aplikasi (yang sudah diuji berkali-kali
lewat HTTP dan browser sungguhan), berkas Docker ini **belum pernah benar-
benar dijalankan**. Uji dulu di lingkungan staging sebelum dipakai produksi.

### Opsi A — VPS sendiri (paling terkendali)

```bash
git clone <url-repo-anda>
cd mikk-client-portal
cp .env.example .env          # isi JWT_SECRET yang baru, lihat perintah di bawah
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
export JWT_SECRET=<hasil-perintah-di-atas>

docker compose up -d db
docker compose run --rm app npm run migrate
docker compose run --rm app npm run seed     # opsional, akun demo
docker compose up -d app
```

Ganti kata sandi peran `mikk_app` (di `db/05_app_role.sql` dan environment
`APP_DATABASE_URL`) sebelum benar-benar dipakai — nilai contoh
`ganti_ini_sebelum_produksi` sengaja dibuat gampang dikenali di kode.

### Opsi B — Render.com (Postgres terkelola, tanpa urus server)

Tidak menjalankan Postgres sendiri di dalam container — pakai add-on
Postgres milik Render, lebih aman untuk data produksi.

1. Push repositori ke GitHub (langkah 1 di atas)
2. Di Render: **New > PostgreSQL** — catat *Internal Connection String*-nya
3. **New > Web Service** — hubungkan ke repositori, pilih *Docker* sebagai environment
4. Isi Environment Variables:
   - `DATABASE_URL` = connection string Postgres dari langkah 2 (dipakai satu kali untuk migrasi — lihat langkah 6)
   - `APP_DATABASE_URL` = akan diisi setelah peran `mikk_app` dibuat (langkah 6)
   - `JWT_SECRET` = string acak panjang, jangan dipakai ulang dari `.env.example`
   - `PORT` = `4000`
5. Deploy dulu sekali supaya container hidup
6. Buka **Shell** dari dashboard Render untuk service ini, jalankan:
   ```bash
   npm run migrate
   npm run seed
   ```
   Lalu update `APP_DATABASE_URL` di Environment Variables memakai host yang
   sama tapi `user=mikk_app` dan kata sandi dari `05_app_role.sql`, dan
   *redeploy*.

### Opsi C — Railway

Alurnya mirip Opsi B: tambahkan plugin PostgreSQL dari Railway, deploy
service dari `Dockerfile`, isi variabel environment yang sama, jalankan
`npm run migrate` lewat Railway CLI atau shell bawaan.

## 3. Setelah live — yang wajib diganti

- [ ] `JWT_SECRET` — jangan pakai nilai contoh
- [ ] Kata sandi peran `mikk_app` (`db/05_app_role.sql`, lalu update `APP_DATABASE_URL`)
- [ ] Nonaktifkan atau ganti kata sandi akun demo (`irfan@`, `putri@`, `legal@nhc.co.id`) — lihat `server/scripts/seed.js`
- [ ] Nomor WhatsApp placeholder di `public/js/app.js` (`muatPendampinganSemua`)
- [ ] Batas ukuran unggahan dokumen di `server/routes/documents.routes.js` (saat ini 20MB)
