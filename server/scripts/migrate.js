// server/scripts/migrate.js
//
// Menjalankan skema secara berurutan pada database KOSONG.
// Bukan sistem migrasi bertahap (belum ada penomoran versi/rollback) —
// untuk Fase 1 ini cukup, karena baru ada satu iterasi skema. Saat
// skema mulai berubah setelah ada data produksi, ganti dengan
// node-pg-migrate atau Prisma Migrate agar perubahan bisa diterapkan
// incremental tanpa DROP.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_DIR = path.join(__dirname, '..', '..', 'db');

// Urutan ini penting:
//   01 mendefinisikan seluruh tabel
//   00 (local auth) baru bisa dibuat setelah tabel users ada
//   02 memasang RLS + view, yang merujuk tabel-tabel di atas
//   03 mengisi data awal NHC
const ORDER = [
  '01_schema.sql',
  '00_local_auth.sql',
  '02_rls_dan_views.sql',
  '03_seed_nhc.sql',
  '05_app_role.sql',
  '06_fase2_schema.sql',
  '07_fase2_rls_views.sql',
  '08_fase3_schema.sql',
  '09_fase3_rls.sql',
  '10_fase3_seed_kupon.sql',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const skipSeed = process.argv.includes('--no-seed');

  for (const file of ORDER) {
    if (skipSeed && file === '03_seed_nhc.sql') continue;
    const full = path.join(DB_DIR, file);
    const sql = fs.readFileSync(full, 'utf8');
    process.stdout.write(`-> ${file} ... `);
    try {
      await pool.query(sql);
      console.log('OK');
    } catch (err) {
      console.log('GAGAL');
      console.error(err.message);
      process.exit(1);
    }
  }

  console.log('\nMigrasi selesai. Jalankan "npm run seed" untuk membuat akun demo.');
  await pool.end();
}

main();
