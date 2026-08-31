// server/routes/permission-overrides.routes.js
//
// Hak akses per pengguna, diatur admin/super admin -- lihat db/25_
// permission_overrides.sql untuk penegakannya (SATU-SATUNYA tempat yang
// benar-benar menegakkan lewat RLS; endpoint di sini sekadar CRUD baris
// pengaturannya, sama pola dengan file routes lain di proyek ini).

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { wajibAdminMikk } = require('../lib/akun-helpers');

const router = express.Router();
router.use(authenticate);

const MODUL_VALID = ['kontrak', 'permits', 'cases', 'projects', 'pendampingan', 'docs'];

// GET /api/permission-overrides/me — override milik SAYA sendiri, dipakai
// frontend saat masuk workspace supaya tahu sidebar/tombol mana yang perlu
// disembunyikan/dikunci utk dirinya. BUKAN admin-only (didaftarkan SEBELUM
// router.use(wajibAdminMikk) di bawah) -- RLS permission_overrides_baca
// sendiri sudah membatasi cuma baris miliknya yang bisa kebaca lewat sini,
// jadi aman diakses siapa saja yang login.
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      'select modul, boleh_lihat, boleh_tulis from permission_overrides where user_id = $1', [req.user.id]);
    res.json({ rows });
  } catch (err) { next(err); }
});

router.use(wajibAdminMikk); // sisanya (lihat/atur hak akses ORANG LAIN) admin-only

// GET /api/permission-overrides/:userId
router.get('/:userId', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select id, modul, boleh_lihat, boleh_tulis, catatan, updated_at
         from permission_overrides where user_id = $1 order by modul`,
      [req.params.userId]);
    res.json({ rows });
  } catch (err) { next(err); }
});

// PUT /api/permission-overrides/:userId/:modul  { bolehLihat, bolehTulis, catatan? }
// Idempoten (upsert) — dipanggil tiap toggle diubah di layar Kelola Akses.
router.put('/:userId/:modul', async (req, res, next) => {
  const { modul } = req.params;
  if (!MODUL_VALID.includes(modul)) return res.status(400).json({ error: 'Modul tidak valid.' });
  const b = req.body || {};
  const bolehLihat = !!b.bolehLihat;
  const bolehTulis = !!b.bolehTulis && bolehLihat; // tidak masuk akal boleh tulis tapi tidak boleh lihat
  try {
    const { rows } = await queryAsUser(req.user.id,
      `insert into permission_overrides (user_id, modul, boleh_lihat, boleh_tulis, catatan, updated_by)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (user_id, modul) do update
         set boleh_lihat = excluded.boleh_lihat, boleh_tulis = excluded.boleh_tulis,
             catatan = excluded.catatan, updated_by = excluded.updated_by, updated_at = now()
       returning id`,
      [req.params.userId, modul, bolehLihat, bolehTulis, b.catatan || null, req.user.id]);
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// DELETE /api/permission-overrides/:userId/:modul — cabut, kembali ke
// perilaku default peran (BUKAN "kunci semua", cuma "tidak ada
// pengecualian lagi utk modul ini").
router.delete('/:userId/:modul', async (req, res, next) => {
  try {
    await queryAsUser(req.user.id,
      'delete from permission_overrides where user_id = $1 and modul = $2', [req.params.userId, req.params.modul]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
