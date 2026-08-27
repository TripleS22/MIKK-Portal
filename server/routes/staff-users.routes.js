// server/routes/staff-users.routes.js
//
// Pembuatan dan pengelolaan akun staf MIKK internal — dua kelompok peran
// (lihat app.is_mikk_admin(), db/02_rls_dan_views.sql):
//   admin      -> mikk_staff.jabatan in ('managing_partner','admin_staf')
//   pic_legal  -> mikk_staff.jabatan in ('senior_associate','associate')
// Berbeda dengan client-users.routes.js (akun customer): kata sandi awal
// akun staf TIDAK dikirim ke email — cuma ditampilkan sekali ke admin
// yang membuatnya (keputusan produk; lihat server/lib/email.js untuk
// alasan kenapa customer beda perlakuan).
//
// PERINGATAN SAMA seperti client-users.routes.js: tabel `users` TIDAK
// dilindungi RLS — pemeriksaan wajibAdminMikk() di sinilah SATU-SATUNYA
// penjaga untuk endpoint ini.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { createAuthUser, updateAuthUserPassword } = require('../lib/supabase-auth');
const { authenticate } = require('../middleware/authenticate');
const { kataSandiAwal, wajibAdminMikk } = require('../lib/akun-helpers');

const router = express.Router();
router.use(authenticate);
router.use(wajibAdminMikk); // seluruh modul ini admin-only, tidak ada baca publik seperti Master Data

const JABATAN_PER_PERAN = {
  admin: ['managing_partner', 'admin_staf'],
  pic_legal: ['senior_associate', 'associate'],
};
const SEMUA_JABATAN = [...JABATAN_PER_PERAN.admin, ...JABATAN_PER_PERAN.pic_legal];

function peranDariJabatan(jabatan) {
  return JABATAN_PER_PERAN.admin.includes(jabatan) ? 'admin' : 'pic_legal';
}

// ---------------------------------------------------------------------
// GET /api/staff-users — daftar seluruh staf MIKK (admin & pic/legal)
// ---------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select u.id as user_id, u.nama, u.email, u.no_hp, u.aktif as user_aktif,
              ms.jabatan, ms.gelar, ms.aktif as staff_aktif
         from mikk_staff ms
         join users u on u.id = ms.user_id
        order by ms.jabatan, u.nama`);
    res.json({ rows: rows.map((r) => ({ ...r, peran: peranDariJabatan(r.jabatan) })) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/staff-users — buat akun staf baru
//
// Mengembalikan kata sandi awal SATU KALI, sama seperti client-users —
// TIDAK dikirim ke email (lihat catatan berkas di atas).
// ---------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  try {
    const email = String(b.email || '').trim().toLowerCase();
    const nama = String(b.nama || '').trim();
    const jabatan = b.jabatan;
    const gelar = b.gelar ? String(b.gelar).trim() : null;

    if (!nama) return res.status(400).json({ error: 'Nama wajib diisi.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (!SEMUA_JABATAN.includes(jabatan)) return res.status(400).json({ error: 'Jabatan tidak valid.' });

    const { rows: ada } = await queryAsUser(req.user.id,
      'select id, tipe from users where lower(email) = $1', [email]);
    if (ada.length) {
      return res.status(409).json({
        error: ada[0].tipe === 'mikk_staff'
          ? 'Email ini sudah terdaftar sebagai staf MIKK.'
          : 'Email ini sudah dipakai akun customer — tidak bisa dipakai ulang untuk akun staf.',
      });
    }

    const sandi = kataSandiAwal();
    // Akun Supabase Auth dibuat SEBELUM baris users, sama seperti pola
    // client-users.routes.js — supaya tidak ada baris users yatim kalau
    // langkah ini gagal (mis. email sudah dipakai di sisi Supabase).
    const akun = await createAuthUser(email, sandi);

    const userId = await withUser(req.user.id, async (client) => {
      const { rows: u } = await client.query(
        `insert into users (email, nama, tipe, no_hp, auth_user_id) values ($1,$2,'mikk_staff',$3,$4)
         returning id`, [email, nama, b.noHp || null, akun.id]);
      await client.query(
        `insert into mikk_staff (user_id, jabatan, gelar) values ($1,$2,$3)`,
        [u[0].id, jabatan, gelar]);
      return u[0].id;
    });

    res.status(201).json({ userId, kataSandiAwal: sandi });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PATCH /api/staff-users/:userId — ubah jabatan/gelar/aktif
// ---------------------------------------------------------------------
router.patch('/:userId', async (req, res, next) => {
  const b = req.body || {};
  try {
    if (b.jabatan !== undefined && !SEMUA_JABATAN.includes(b.jabatan)) {
      return res.status(400).json({ error: 'Jabatan tidak valid.' });
    }
    const set = [], val = [req.params.userId];
    const taruh = (k, v) => { val.push(v); set.push(`${k} = $${val.length}`); };
    if (Object.prototype.hasOwnProperty.call(b, 'jabatan')) taruh('jabatan', b.jabatan);
    if (Object.prototype.hasOwnProperty.call(b, 'gelar')) taruh('gelar', b.gelar || null);
    if (Object.prototype.hasOwnProperty.call(b, 'aktif')) taruh('aktif', !!b.aktif);
    if (!set.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });

    const { rows } = await queryAsUser(req.user.id,
      `update mikk_staff set ${set.join(', ')} where user_id = $1 returning user_id`, val);
    if (!rows.length) return res.status(404).json({ error: 'Staf tidak ditemukan.' });
    res.json({ userId: rows[0].user_id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/staff-users/:userId/reset-password
// ---------------------------------------------------------------------
router.post('/:userId/reset-password', async (req, res, next) => {
  try {
    const { rows: staf } = await queryAsUser(req.user.id,
      `select u.id, u.email, u.auth_user_id from users u
         join mikk_staff ms on ms.user_id = u.id
        where u.id = $1 limit 1`, [req.params.userId]);
    if (!staf.length) return res.status(404).json({ error: 'Staf tidak ditemukan.' });

    const sandi = kataSandiAwal();
    let authUserId = staf[0].auth_user_id;
    if (authUserId) {
      await updateAuthUserPassword(authUserId, sandi);
    } else {
      const akun = await createAuthUser(staf[0].email, sandi);
      authUserId = akun.id;
      await queryAsUser(req.user.id, 'update users set auth_user_id = $1 where id = $2',
        [authUserId, req.params.userId]);
    }
    res.json({ kataSandiAwal: sandi });
  } catch (err) { next(err); }
});

module.exports = router;
