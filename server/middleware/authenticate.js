// server/middleware/authenticate.js
//
// Memverifikasi token, lalu melekatkan req.user = { id, email, nama, tipe }.
// Middleware ini TIDAK memutuskan apa yang boleh dilihat pengguna — itu
// tugas RLS di Postgres (lihat server/lib/db.js). Tugas middleware ini
// hanya satu: memastikan req.user.id benar-benar identitas yang sudah
// diverifikasi, karena nilai itulah yang nanti diteruskan ke
// app.current_user_id() dan menjadi dasar seluruh keputusan RLS.

const { verifyToken } = require('../lib/auth');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login kembali.' });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, nama: payload.nama, tipe: payload.tipe };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.' });
  }
}

module.exports = { authenticate };
