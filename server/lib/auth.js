// server/lib/auth.js
//
// Autentikasi lokal — pengganti Supabase Auth untuk pengembangan/demo.
// Lihat db/00_local_auth.sql untuk penjelasan lengkap kenapa ini terpisah
// dari skema aplikasi utama.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.includes('ganti-dengan')) {
  console.warn(
    '[auth] PERINGATAN: JWT_SECRET belum diganti dari nilai contoh. ' +
    'Wajib diganti sebelum dipakai di luar pengembangan lokal.'
  );
}

const TOKEN_TTL = '8h';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { signToken, verifyToken, hashPassword, checkPassword };
