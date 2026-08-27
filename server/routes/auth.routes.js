// server/routes/auth.routes.js
const express = require('express');
const { queryAnon, queryAsUser } = require('../lib/db');
const { signInWithPassword, refreshSession } = require('../lib/supabase-auth');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// POST /api/auth/login
// Frontend TIDAK bicara langsung ke Supabase — kredensial tetap lewat
// API kita sendiri, lalu diteruskan ke Supabase Auth di sini (lihat
// server/lib/supabase-auth.js). Bentuk respons ({token, user}) sengaja
// dipertahankan sama seperti sebelum migrasi, ditambah refreshToken.
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
  }
  // Pesan generik disengaja: tidak membedakan "email tidak ada" dari
  // "kata sandi salah", supaya tidak membantu penebakan akun yang ada.
  const gagal = () => res.status(401).json({ error: 'Email atau kata sandi salah.' });

  try {
    let sesi;
    try {
      sesi = await signInWithPassword(email, password);
    } catch (e) {
      return gagal();
    }

    // Supabase Auth tidak tahu soal kolom `aktif` kita — akun yang sudah
    // dinonaktifkan lewat aplikasi ini tetap harus ditolak di sini,
    // walau kredensial Supabase-nya sendiri masih sah.
    const { rows } = await queryAnon(
      'select id, email, nama, tipe, aktif from users where lower(email) = lower($1)',
      [email]
    );
    const user = rows[0];
    if (!user || !user.aktif) return gagal();

    res.json({
      token: sesi.accessToken,
      refreshToken: sesi.refreshToken,
      user: { id: user.id, email: user.email, nama: user.nama, tipe: user.tipe },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/refresh — access token Supabase berumur pendek (~1 jam
// secara bawaan), jadi frontend memanggil ini diam-diam saat kedaluwarsa
// alih-alih memaksa pengguna login ulang tiap jam.
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken wajib disertakan.' });
  try {
    const sesi = await refreshSession(refreshToken);
    res.json({ token: sesi.accessToken, refreshToken: sesi.refreshToken });
  } catch (err) {
    res.status(401).json({ error: 'Sesi tidak bisa diperpanjang. Silakan login kembali.' });
  }
});

// GET /api/auth/workspaces
// Menjawab layar "Choose Your Workspace" di mockup — dengan data
// sungguhan, bukan tiga kartu statis. Satu orang bisa mendapat lebih
// dari satu baris kalau ia anggota di beberapa klien atau punya peran
// staf MIKK sekaligus.
router.get('/workspaces', authenticate, async (req, res) => {
  const { rows } = await queryAsUser(
    req.user.id,
    `select 'client'::text as tipe, co.id as client_org_id, co.nama_singkat,
            co.nama_legal, cm.peran
       from client_memberships cm
       join client_orgs co on co.id = cm.client_org_id
      where cm.user_id = $1 and cm.aktif
     union all
     select 'staf_klien'::text, ca.client_org_id, co.nama_singkat, co.nama_legal, ca.peran
       from client_assignments ca
       join client_orgs co on co.id = ca.client_org_id
      where ca.user_id = $1 and (ca.selesai is null or ca.selesai >= current_date)
     union all
     select 'staf_firma'::text, null, null, null, ms.jabatan
       from mikk_staff ms
      where ms.user_id = $1 and ms.aktif
        and ms.jabatan in ('managing_partner','admin_staf')`,
    [req.user.id]
  );
  res.json({ workspaces: rows });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
