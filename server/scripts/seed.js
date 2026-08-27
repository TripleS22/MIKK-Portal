// server/scripts/seed.js
//
// 03_seed_nhc.sql (SQL murni) membuat baris di `users` untuk staf MIKK,
// tapi TIDAK membuat kredensial login — itu dilakukan di sini lewat
// Supabase Auth Admin API (server/lib/supabase-auth.js), bukan lagi
// bcrypt+local_auth (ditiadakan, lihat db/16_hapus_local_auth.sql).
// Setiap akun yang dibuat/diperbarui di sini langsung ditautkan lewat
// users.auth_user_id supaya login pertamanya tidak perlu fallback email
// (lihat server/middleware/authenticate.js).
//
// HANYA untuk pengembangan/demo — kata sandinya seragam dan diketahui
// publik lewat repo ini. Untuk akun produksi sungguhan, buat lewat alur
// undangan Supabase (admin.inviteUserByEmail) atau kata sandi acak yang
// dikomunikasikan terpisah, bukan skrip ini.
//
// Skrip ini juga membuat SATU pengguna sisi klien (Andi Pratama, NHC)
// agar isolasi antar klien bisa diuji end-to-end sejak awal.

require('dotenv').config();
const { Pool } = require('pg');
const { createAuthUser } = require('../lib/supabase-auth');

const DEMO_PASSWORD = 'MikkDemo!2026';

async function buatAtauTautkanAkun(pool, email) {
  try {
    const akun = await createAuthUser(email, DEMO_PASSWORD);
    await pool.query('update users set auth_user_id = $1 where lower(email) = lower($2)', [akun.id, email]);
  } catch (err) {
    // Skrip ini dirancang bisa dijalankan berulang (seperti sebelumnya
    // dengan "on conflict do update"). Kalau akunnya sudah ada di
    // Supabase Auth dari jalankan sebelumnya, itu bukan kegagalan —
    // tautannya (auth_user_id) sudah terisi lewat login pertama
    // (self-healing di server/middleware/authenticate.js) atau memang
    // sudah pernah ditautkan skrip ini sebelumnya.
    console.log(`  (${email} sudah punya akun Supabase Auth — dilewati: ${err.message})`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const staff = ['irfan@mikklaws.com', 'ageng@mikklaws.com', 'putri@mikklaws.com'];
  for (const email of staff) {
    const { rows } = await pool.query('select id from users where email = $1', [email]);
    if (!rows.length) { console.log(`  lewati ${email} (belum ada — jalankan migrate dulu)`); continue; }
    await buatAtauTautkanAkun(pool, email);
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
    await buatAtauTautkanAkun(pool, 'legal@nhc.co.id');
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
