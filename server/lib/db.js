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
//
//   Pool TIDAK dibuat otomatis saat modul ini di-require — harus lewat
//   initDb(connectionString) dulu. Ini disengaja supaya modul yang sama
//   bisa dipakai dua jalur deploy yang connection string-nya datang dari
//   tempat berbeda: server/index.js (Node biasa, dari APP_DATABASE_URL di
//   .env) dan server/worker.js (Cloudflare Workers, dari binding
//   Hyperdrive env.HYPERDRIVE.connectionString — bindings itu cuma ada di
//   dalam fetch handler, tidak bisa dibaca saat modul di-load).

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

let pool = null;

/**
 * Wajib dipanggil SEKALI sebelum route mana pun menyentuh database.
 * Aman dipanggil berkali-kali (mis. tiap fetch event di Workers) —
 * panggilan kedua dst. jadi no-op kalau pool sudah ada.
 */
function initDb(connectionString) {
  if (pool) return pool;
  if (!connectionString) {
    throw new Error(
      'initDb() dipanggil tanpa connection string. Lihat README bagian ' +
      '"Dua koneksi database, bukan satu" — APP_DATABASE_URL (Node biasa) ' +
      'atau binding Hyperdrive (Cloudflare Workers) wajib diisi.'
    );
  }
  pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
  pool.on('error', (err) => {
    console.error('[db] Kesalahan tak terduga pada koneksi idle:', err.message);
  });
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error(
      '[db] Pool belum diinisialisasi — initDb(connectionString) belum pernah ' +
      'dipanggil. Lihat server/index.js (Node biasa) atau server/worker.js (Workers).'
    );
  }
  return pool;
}

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
  const client = await getPool().connect();
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
  return getPool().query(text, params);
}

module.exports = { initDb, getPool, withUser, queryAsUser, queryAnon };
