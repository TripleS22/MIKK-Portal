// server/middleware/authenticate.js
//
// Memverifikasi token Supabase Auth, lalu melekatkan req.user = { id,
// email, nama, tipe }. Middleware ini TIDAK memutuskan apa yang boleh
// dilihat pengguna — itu tugas RLS di Postgres (lihat server/lib/db.js).
// Tugas middleware ini hanya satu: memastikan req.user.id benar-benar
// identitas yang sudah diverifikasi, karena nilai itulah yang nanti
// diteruskan ke app.current_user_id() dan menjadi dasar seluruh
// keputusan RLS.
//
// req.user.id TETAP `users.id` milik aplikasi ini (bukan auth.users.id
// Supabase) — lihat catatan panjang di db/15_supabase_auth_user_id.sql
// soal kenapa PK ini sengaja tidak diubah. Baris users dicocokkan lewat
// kolom auth_user_id (atau, untuk baris lama yang belum pernah
// ditautkan, lewat email sebagai fallback satu kali — lalu ditautkan).

const { verifySupabaseJwt } = require('../lib/supabase-auth');
const { queryAnon } = require('../lib/db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login kembali.' });
  }

  try {
    const { sub, email } = await verifySupabaseJwt(token);

    const { rows } = await queryAnon(
      `select id, email, nama, tipe, aktif, auth_user_id from users
        where auth_user_id = $1
           or (auth_user_id is null and lower(email) = lower($2))
        limit 1`,
      [sub, email]
    );
    const user = rows[0];
    if (!user || !user.aktif) {
      return res.status(401).json({ error: 'Akun tidak ditemukan, atau sudah dinonaktifkan.' });
    }

    if (!user.auth_user_id) {
      // Baris lama (dari seed, sebelum akun ini pernah login lewat
      // Supabase Auth) — tautkan sekarang supaya login berikutnya lewat
      // jalur cepat (auth_user_id), bukan fallback email terus-menerus.
      // Kegagalan di sini tidak boleh menggagalkan permintaan yang
      // sedang berjalan — ini murni housekeeping.
      queryAnon('update users set auth_user_id = $1 where id = $2', [sub, user.id]).catch((err) => {
        console.error('[authenticate] gagal menautkan auth_user_id:', err.message);
      });
    }

    req.user = { id: user.id, email: user.email, nama: user.nama, tipe: user.tipe };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.' });
  }
}

module.exports = { authenticate };
