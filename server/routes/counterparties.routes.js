// server/routes/counterparties.routes.js
//
// app.cek_benturan() adalah fungsi SECURITY DEFINER di Postgres (lihat
// 02_rls_dan_views.sql): ia mencocokkan ke SELURUH registri lawan pihak
// tapi hanya mengembalikan putusan — bukan daftar. Endpoint ini sekadar
// meneruskan pemanggilan; logikanya sendiri sengaja tidak diduplikasi
// di lapisan aplikasi.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

// POST /api/counterparties/check-conflict  { nama, clientOrgId? }
router.post('/check-conflict', async (req, res, next) => {
  try {
    const { nama, clientOrgId } = req.body || {};
    if (!nama || !nama.trim()) {
      return res.status(400).json({ error: 'Nama wajib diisi.' });
    }
    const { rows } = await queryAsUser(
      req.user.id,
      `select putusan, alasan from app.cek_benturan($1, $2)`,
      [nama.trim(), clientOrgId || null]
    );
    res.json(rows[0] || { putusan: 'belum_diperiksa', alasan: null });
  } catch (err) { next(err); }
});

// GET /api/counterparties?clientOrgId=
// RLS membatasi hasil hanya ke entitas yang tertaut ke kontrak klien ini
// (atau seluruhnya, untuk staf MIKK). Endpoint tidak menambah filter lagi.
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    const { rows } = await queryAsUser(
      req.user.id,
      `select distinct c.id, c.nama_legal, c.nama_alias, c.jenis, c.is_client
         from counterparties c
         left join contracts x on x.counterparty_id = c.id
        where $1::uuid is null or x.client_org_id = $1
        order by c.nama_legal`,
      [clientOrgId || null]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// POST /api/counterparties  — mendaftarkan entitas baru ke registri
router.post('/', async (req, res, next) => {
  const { nama, alias, jenis } = req.body || {};
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama badan hukum wajib diisi.' });

  try {
    const result = await withUser(req.user.id, async (client) => {
      const { rows } = await client.query(
        `insert into counterparties (nama_legal, nama_alias, jenis, created_by)
         values ($1, $2, $3, $4) returning id, nama_legal`,
        [nama.trim(), alias || [], jenis || null, req.user.id]
      );
      return rows[0];
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
