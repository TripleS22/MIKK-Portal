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
//
//   DUA MODE, BUKAN SATU — ditemukan lewat deploy sungguhan ke Workers
//   (bukan tebakan): initDb() (Pool persisten, dipakai ulang lintas
//   request) dites langsung di https://mikk-portal.sugaras644.workers.dev
//   dan login SEKALIGUS/paralel gagal ~20-30% dengan "The Workers runtime
//   canceled this request because it detected that your Worker's code
//   had hung" — ini persis pola yang didokumentasikan Cloudflare sendiri
//   (Hyperdrive docs, "Connect to PostgreSQL"): Pool/Client yang dipakai
//   ulang lintas request TIDAK didukung di Workers (beda dari Node biasa,
//   isolate bisa didaur ulang antar-request, soket yang "idle" di Pool
//   jadi tidak valid) — polanya WAJIB Client baru per request, dibuang
//   setelah dipakai; Hyperdrive sendiri yang menyediakan pooling
//   sungguhan di sisi edge, bukan Pool lokal di dalam Worker.
//   initDb() (mode 'pool') TETAP dipakai server/index.js (proses Node
//   biasa, hidup lama, ini pola yang BENAR di situ) — server/worker.js
//   sekarang memanggil initDbPerRequest() (mode 'perrequest') sebagai
//   gantinya.

const { Pool, Client, types } = require('pg');

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

let mode = null; // 'pool' | 'perrequest'
let pool = null;
let perRequestConnectionString = null;

/**
 * Node biasa (server/index.js) — Pool persisten, dipakai ulang lintas
 * request selama proses hidup. Aman dipanggil berkali-kali (no-op kalau
 * pool sudah ada).
 */
function initDb(connectionString) {
  if (pool) return pool;
  if (!connectionString) {
    throw new Error(
      'initDb() dipanggil tanpa connection string. Lihat README bagian ' +
      '"Dua koneksi database, bukan satu" — APP_DATABASE_URL wajib diisi.'
    );
  }
  mode = 'pool';
  pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
  pool.on('error', (err) => {
    console.error('[db] Kesalahan tak terduga pada koneksi idle:', err.message);
  });
  return pool;
}

/**
 * Cloudflare Workers (server/worker.js) — TIDAK membuat Pool. Tiap
 * withUser()/queryAnon() membuat pg.Client baru, dipakai, lalu ditutup —
 * lihat catatan panjang di atas kenapa (Pool persisten lintas request
 * terbukti hang ~20-30% di bawah beban paralel nyata). Aman dipanggil
 * berkali-kali (idempoten terhadap connection string yang sama).
 */
function initDbPerRequest(connectionString) {
  if (!connectionString) {
    throw new Error(
      'initDbPerRequest() dipanggil tanpa connection string. Binding ' +
      'Hyperdrive (env.HYPERDRIVE.connectionString) wajib ada.'
    );
  }
  mode = 'perrequest';
  perRequestConnectionString = connectionString;
}

function getPool() {
  if (mode !== 'pool' || !pool) {
    throw new Error(
      '[db] getPool() cuma valid di mode Pool persisten (initDb() — Node biasa). ' +
      'Di Workers (initDbPerRequest()) tidak ada Pool untuk diambil; pakai ' +
      'withUser()/queryAsUser()/queryAnon() seperti biasa.'
    );
  }
  return pool;
}

/** Mengembalikan koneksi baru yang siap dipakai satu kali, sesuai mode aktif. */
async function ambilKoneksi() {
  if (mode === 'perrequest') {
    if (!perRequestConnectionString) {
      throw new Error('[db] Belum diinisialisasi — panggil initDbPerRequest() dulu (server/worker.js).');
    }
    const client = new Client({ connectionString: perRequestConnectionString });
    await client.connect();
    return { client, tutup: () => client.end() };
  }
  const client = await getPool().connect();
  return { client, tutup: () => client.release() };
}

/**
 * Jalankan satu atau beberapa query di dalam transaksi yang tahu siapa
 * penggunanya. RLS di Postgres membaca nilai ini lewat app.current_user_id().
 *
 * @param {string|null} userId  UUID pengguna yang sedang login, atau null
 *                              untuk konteks tanpa pengguna (mis. login itu
 *                              sendiri, yang membaca tabel users tanpa RLS
 *                              karena belum ada sesi).
 * @param {(client: import('pg').PoolClient|import('pg').Client) => Promise<any>} fn
 */
async function withUser(userId, fn) {
  const { client, tutup } = await ambilKoneksi();
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
    await tutup();
  }
}

/** Query sekali jalan tanpa transaksi eksplisit, dengan konteks pengguna. */
async function queryAsUser(userId, text, params) {
  return withUser(userId, (client) => client.query(text, params));
}

/** Untuk operasi yang sah tanpa pengguna login (login, cek kesehatan server). */
async function queryAnon(text, params) {
  if (mode === 'perrequest') {
    const { client, tutup } = await ambilKoneksi();
    try {
      return await client.query(text, params);
    } finally {
      await tutup();
    }
  }
  return getPool().query(text, params);
}

module.exports = { initDb, initDbPerRequest, getPool, withUser, queryAsUser, queryAnon };
