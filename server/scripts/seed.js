// server/scripts/seed.js
//
// 03_seed_nhc.sql (SQL murni) membuat baris di `users` untuk staf MIKK,
// tapi TIDAK membuat kata sandi — hashing bcrypt dilakukan di sini, di
// Node, memakai library yang sama dengan yang dipakai saat login
// (server/lib/auth.js), supaya hash yang dihasilkan pasti bisa
// diverifikasi oleh endpoint login.
//
// Skrip ini juga membuat SATU pengguna sisi klien (Andi Pratama, NHC)
// agar isolasi antar klien bisa diuji end-to-end sejak awal.

require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../lib/auth');

const DEMO_PASSWORD = 'MikkDemo!2026';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await hashPassword(DEMO_PASSWORD);

  const staff = ['irfan@mikklaws.com', 'ageng@mikklaws.com', 'putri@mikklaws.com'];
  for (const email of staff) {
    const { rows } = await pool.query('select id from users where email = $1', [email]);
    if (!rows.length) { console.log(`  lewati ${email} (belum ada — jalankan migrate dulu)`); continue; }
    await pool.query(
      `insert into local_auth (user_id, password_hash) values ($1, $2)
       on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`,
      [rows[0].id, hash]
    );
    console.log(`  kata sandi diset untuk ${email}`);
  }

  // Pengguna sisi klien NHC — untuk menguji isolasi antar klien end-to-end.
  const { rows: nhcRows } = await pool.query(
    `select id from client_orgs where nama_singkat = 'NHC'`
  );
  if (nhcRows.length) {
    const nhcId = nhcRows[0].id;
    const { rows: userRows } = await pool.query(
      `insert into users (email, nama, tipe) values ($1, $2, 'client_user')
       on conflict (email) do update set nama = excluded.nama
       returning id`,
      ['legal@nhc.co.id', 'Andi Pratama']
    );
    const andiId = userRows[0].id;
    await pool.query(
      `insert into local_auth (user_id, password_hash) values ($1, $2)
       on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`,
      [andiId, hash]
    );
    await pool.query(
      `insert into client_memberships (user_id, client_org_id, peran) values ($1, $2, 'legal_manager')
       on conflict (user_id, client_org_id) do nothing`,
      [andiId, nhcId]
    );
    console.log('  kata sandi diset untuk legal@nhc.co.id (klien NHC)');
  } else {
    console.log('  NHC tidak ditemukan — lewati pembuatan pengguna klien');
  }

  console.log(`\nSelesai. Kata sandi demo untuk seluruh akun: ${DEMO_PASSWORD}`);
  console.log('WAJIB diganti sebelum dipakai di luar lingkungan pengembangan.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
