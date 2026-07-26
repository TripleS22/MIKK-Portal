// server/lib/db.js
//
// Lapisan akses database. Yang perlu dipahami Sigit di sini:
//
//   RLS ditegakkan oleh POSTGRES, bukan oleh kode ini. Kode ini hanya
//   memberi tahu Postgres "siapa yang sedang bertanya" dengan mengeset
//   app.current_user_id di dalam SETIAP transaksi, sebelum query
//   dijalankan. Kebijakan RLS di 02_rls_dan_views.sql yang memutuskan
//   baris mana yang boleh dibaca/ditulis pengguna itu.
//
//   Ini BUKAN pemeriksaan hak akses tambahan di aplikasi — ini SATU-
//   SATUNYA pemeriksaan. Jika sebuah endpoint lupa memanggil withUser(),
//   query akan berjalan sebagai peran database biasa tanpa RLS
//   (tergantung peran koneksi), jadi withUser() WAJIB dipakai di semua
//   query yang menyentuh data milik klien.

const { Pool, types } = require('pg');

// node-pg secara default mengonversi kolom bertipe `date` (OID 1082) jadi
// objek Date JavaScript. Saat di-serialize ke JSON, itu menjadi string ISO
// LENGKAP dengan waktu dan zona ("2026-08-08T00:00:00.000Z"), padahal kolom
// aslinya cuma tanggal tanpa waktu. Frontend (tglTampil di app.js) berasumsi
// menerima "YYYY-MM-DD" polos dan menambahkan "T00:00:00" sendiri — kalau
// tidak diperbaiki di sini, hasilnya "Invalid Date" untuk SETIAP tanggal
// yang ditampilkan, di semua modul (kontrak, izin, litigasi, proyek, dst).
//
// Perbaikannya di satu tempat, bukan di tiap query: minta node-pg
// mengembalikan nilai `date` apa adanya sebagai teks, tanpa dikonversi.
types.setTypeParser(1082, (val) => val); // 1082 = OID tipe 'date' di Postgres

// SENGAJA terpisah dari DATABASE_URL (yang dipakai migrate.js sebagai
// superuser). Jika APP_DATABASE_URL tidak diset, server MENOLAK menyala
// alih-alih diam-diam berjalan sebagai superuser dan melewati RLS — itu
// kegagalan yang berbahaya karena semua terlihat normal sampai ada
// kebocoran data antar klien yang tidak ketahuan sampai insiden nyata.
const connectionString = process.env.APP_DATABASE_URL;
if (!connectionString) {
  console.error(
    '[db] APP_DATABASE_URL tidak diset. Server TIDAK dijalankan: tanpa ini, ' +
    'ada risiko nyata koneksi jatuh ke peran superuser yang melewati RLS ' +
    'sepenuhnya, sehingga isolasi antar klien berhenti bekerja tanpa gejala ' +
    'yang terlihat. Lihat README bagian "Dua koneksi database, bukan satu".'
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });

pool.on('error', (err) => {
  console.error('[db] Kesalahan tak terduga pada koneksi idle:', err.message);
});

/**
 * Jalankan satu atau beberapa query di dalam transaksi yang tahu siapa
 * penggunanya. RLS di Postgres membaca nilai ini lewat app.current_user_id().
 *
 * @param {string|null} userId  UUID pengguna yang sedang login, atau null
 *                              untuk konteks tanpa pengguna (mis. login itu
 *                              sendiri, yang membaca tabel users tanpa RLS
 *                              karena belum ada sesi).
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withUser(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId) {
      // set_config(..., true) => berlaku hanya untuk transaksi ini (local),
      // otomatis hilang saat COMMIT/ROLLBACK. Ini mencegah kebocoran sesi
      // antar permintaan yang berbagi koneksi dari connection pool.
      await client.query("select set_config('app.current_user_id', $1, true)", [userId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Query sekali jalan tanpa transaksi eksplisit, dengan konteks pengguna. */
async function queryAsUser(userId, text, params) {
  return withUser(userId, (client) => client.query(text, params));
}

/** Untuk operasi yang sah tanpa pengguna login (login, cek kesehatan server). */
async function queryAnon(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, withUser, queryAsUser, queryAnon };
