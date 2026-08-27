// server/index.js — titik masuk Node biasa (dev lokal, VPS/Render, dst.)
// Untuk Cloudflare Workers, lihat server/worker.js — connection string-nya
// datang dari binding Hyperdrive, bukan dari .env.
require('dotenv').config();
const path = require('path');
const { initDb, getPool } = require('./lib/db');
const { initDiskStorage } = require('./lib/storage');
const { initEmail } = require('./lib/email');

initDiskStorage(path.join(__dirname, '..', 'uploads'));

// RESEND_API_KEY opsional: kalau belum diisi, kirimKredensialCustomer()
// gagal lunak (lihat server/lib/email.js) — akun customer tetap dibuat,
// kata sandinya cuma tidak ikut terkirim ke email (tetap tampil sekali
// di layar seperti sebelum fitur ini ada).
initEmail({
  apiKey: process.env.RESEND_API_KEY,
  dariEmail: process.env.RESEND_FROM_EMAIL,
  portalUrl: process.env.PORTAL_URL,
});

// SENGAJA terpisah dari DATABASE_URL (dipakai migrate.js/seed.js sebagai
// superuser). Jika APP_DATABASE_URL tidak diset, server MENOLAK menyala
// alih-alih diam-diam jatuh ke jalur lain — lihat README bagian "Dua
// koneksi database, bukan satu" untuk insiden nyata yang pernah terjadi
// karena ini tidak ditegakkan.
if (!process.env.APP_DATABASE_URL) {
  console.error(
    '[db] APP_DATABASE_URL tidak diset. Server TIDAK dijalankan: tanpa ini, ' +
    'ada risiko nyata koneksi jatuh ke peran superuser yang melewati RLS ' +
    'sepenuhnya, sehingga isolasi antar klien berhenti bekerja tanpa gejala ' +
    'yang terlihat. Lihat README bagian "Dua koneksi database, bukan satu".'
  );
  process.exit(1);
}
initDb(process.env.APP_DATABASE_URL);

const app = require('./app');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await getPool().query('select 1');
  } catch (err) {
    console.error('[startup] Tidak bisa terhubung ke database. Periksa APP_DATABASE_URL di .env');
    console.error(err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`MIKK Client Portal API berjalan di http://localhost:${PORT}`);
  });
}

start();
