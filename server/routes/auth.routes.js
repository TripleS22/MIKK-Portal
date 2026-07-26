// server/routes/auth.routes.js
const express = require('express');
const { queryAnon, queryAsUser } = require('../lib/db');
const { signToken, checkPassword } = require('../lib/auth');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// POST /api/auth/login
// Konteks: BELUM ada pengguna terautentikasi, jadi query pakai queryAnon.
// Ini satu-satunya tempat di aplikasi yang boleh membaca users/local_auth
// tanpa app.current_user_id — karena memang belum ada sesi untuk diset.
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
  }

  const { rows } = await queryAnon(
    `select u.id, u.email, u.nama, u.tipe, u.aktif, la.password_hash
       from users u
       join local_auth la on la.user_id = u.id
      where lower(u.email) = lower($1)`,
    [email]
  );

  const user = rows[0];
  // Pesan generik disengaja: tidak membedakan "email tidak ada" dari
  // "kata sandi salah", supaya tidak membantu penebakan akun yang ada.
  const gagal = () => res.status(401).json({ error: 'Email atau kata sandi salah.' });

  if (!user || !user.aktif) return gagal();
  const cocok = await checkPassword(password, user.password_hash);
  if (!cocok) return gagal();

  const token = signToken({ sub: user.id, email: user.email, nama: user.nama, tipe: user.tipe });
  res.json({
    token,
    user: { id: user.id, email: user.email, nama: user.nama, tipe: user.tipe },
  });
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
