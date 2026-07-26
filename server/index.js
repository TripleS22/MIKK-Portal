// server/index.js
const app = require('./app');
const { pool } = require('./lib/db');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await pool.query('select 1');
  } catch (err) {
    console.error('[startup] Tidak bisa terhubung ke database. Periksa DATABASE_URL di .env');
    console.error(err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`MIKK Client Portal API berjalan di http://localhost:${PORT}`);
  });
}

start();
