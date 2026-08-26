// server/routes/individual-clients.routes.js
//
// Klien perorangan — pemilik perkara yang bukan organisasi retainer.
// Sama seperti client-orgs.routes.js: RLS (individual_clients_baca/tulis di
// 12_klien_perorangan_kelompok_rls.sql) yang menegakkan siapa boleh apa;
// endpoint ini sekadar meneruskan lewat queryAsUser.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select id, nama, nik, npwp, alamat, no_hp, email, catatan, created_at
         from individual_clients order by nama`
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.nama || !b.nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into individual_clients (nama, nik, npwp, alamat, no_hp, email, catatan)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [b.nama.trim(), b.nik || null, b.npwp || null, b.alamat || null, b.noHp || null, b.email || null, b.catatan || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

function mapPgError(err) {
  if (err.code === '42501') {
    return httpError(403, 'Hanya Managing Partner atau Admin Staf yang dapat menambah klien perorangan.');
  }
  return err;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = router;
