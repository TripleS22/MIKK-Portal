// server/lib/supabase-auth.js
//
// Jembatan ke Supabase Auth — menggantikan JWT kustom + bcrypt lokal
// (server/lib/auth.js lama, db/00_local_auth.sql) sebagai SATU-SATUNYA
// bagian yang berubah dalam migrasi ini. Di bawahnya TIDAK ada yang
// disentuh: app.current_user_id() dan seluruh kebijakan RLS tetap
// berbasis GUC transaksi seperti semula (lihat server/lib/db.js) —
// modul ini hanya bertanggung jawab menghasilkan req.user yang benar.
//
// - Verifikasi token pengguna: lewat JWKS publik Supabase (proyek ini
//   memakai kunci asimetris — sudah dicek langsung ke endpoint JWKS-nya,
//   bukan diasumsikan), jadi TIDAK perlu shared secret di sini.
// - Operasi admin (buat akun, ubah kata sandi): lewat Admin REST API
//   dengan service-role key — WAJIB rahasia, JANGAN PERNAH dikirim ke
//   frontend atau dicatat ke log.
//
// Endpoint Admin API sengaja diuji langsung ke project Supabase
// sungguhan sebelum dipakai di sini, bukan ditebak dari dokumentasi:
// dokumentasi resmi menyebut update user lewat path TUNGGAL
// (/admin/user/{id}), tapi di gateway Supabase yang di-hosting itu
// 404 — yang benar-benar berfungsi adalah path JAMAK yang sama dengan
// create user (/admin/users/{id}). Dicatat di sini supaya tidak ada
// yang "memperbaikinya" kembali ke path yang cocok dengan dokumentasi
// tapi ternyata tidak jalan.

const { createRemoteJWKSet, jwtVerify } = require('jose');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [nama, nilai] of [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
]) {
  if (!nilai) {
    console.warn(`[supabase-auth] PERINGATAN: ${nama} tidak diset — otentikasi tidak akan berfungsi.`);
  }
}

let jwks;
function getJwks() {
  // Dibuat sekali, dipakai ulang — createRemoteJWKSet sendiri sudah
  // menyimpan cache kunci di memori (di-refresh otomatis kalau ada kid
  // yang belum dikenal), jadi tidak perlu cache manual tambahan di sini.
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

/** Verifikasi access token Supabase yang dikirim klien lewat header Authorization.
 * Melempar kalau tanda tangan tidak valid, kedaluwarsa, atau audience/issuer tidak cocok. */
async function verifySupabaseJwt(token) {
  const { payload } = await jwtVerify(token, getJwks());
  return { sub: payload.sub, email: payload.email };
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function authFetch(path, { method = 'GET', body, useServiceRole = false } = {}) {
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const pesan = (data && (data.error_description || data.msg || data.message)) || 'Permintaan ke Supabase Auth gagal.';
    throw httpError(res.status, pesan);
  }
  return data;
}

function bentukSesi(data) {
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

/** Login email+password. Dipanggil dari POST /api/auth/login di server —
 * frontend TIDAK bicara langsung ke Supabase, supaya alur & bentuk
 * respons API kita tidak berubah dari sudut pandang frontend. */
async function signInWithPassword(email, password) {
  const data = await authFetch('/token?grant_type=password', { method: 'POST', body: { email, password } });
  return bentukSesi(data);
}

/** Perpanjang sesi dari refresh token — dipakai POST /api/auth/refresh
 * (access token Supabase berumur pendek, tidak seperti JWT kustom lama
 * yang 8 jam; tanpa ini pengguna akan ter-logout tiap ~1 jam). */
async function refreshSession(refreshToken) {
  const data = await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
  return bentukSesi(data);
}

/** Buat akun Supabase Auth baru — dipakai staf membuat akun klien baru
 * (client-users.routes.js) dan pendaftaran mandiri calon klien
 * (prospects.routes.js). email_confirm:true karena kedua alur ini sudah
 * punya jaminan kepemilikan email sendiri (dibuat admin, atau dipakai
 * langsung oleh pendaftarnya sendiri) — bukan alur verifikasi publik. */
async function createAuthUser(email, password) {
  const data = await authFetch('/admin/users', {
    method: 'POST', useServiceRole: true,
    body: { email, password, email_confirm: true },
  });
  return { id: data.id };
}

/** Ubah kata sandi akun yang sudah ada (dipakai alur reset password). */
async function updateAuthUserPassword(authUserId, password) {
  await authFetch(`/admin/users/${authUserId}`, {
    method: 'PUT', useServiceRole: true, body: { password },
  });
}

module.exports = {
  verifySupabaseJwt, signInWithPassword, refreshSession, createAuthUser, updateAuthUserPassword,
};
