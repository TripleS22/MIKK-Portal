// server/routes/client-groups.routes.js
//
// Klien kelompok (bareng-bareng) — beberapa individual_clients yang
// tercatat sebagai satu pihak dalam perkara (mis. "Warga RT 04"). RLS
// (client_groups_baca/tulis, client_group_members_baca/tulis di
// 12_klien_perorangan_kelompok_rls.sql) yang menegakkan akses.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select g.id, g.nama_kelompok, g.catatan, g.created_at,
              coalesce(
                json_agg(json_build_object('id', ic.id, 'nama', ic.nama, 'peran', m.peran_dalam_kelompok))
                  filter (where ic.id is not null),
                '[]'
              ) as anggota
         from client_groups g
         left join client_group_members m on m.client_group_id = g.id
         left join individual_clients ic  on ic.id = m.individual_client_id
        group by g.id
        order by g.nama_kelompok`
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// POST /api/client-groups  { namaKelompok, catatan?, anggotaIds?: uuid[] }
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.namaKelompok || !b.namaKelompok.trim()) {
    return res.status(400).json({ error: 'Nama kelompok wajib diisi.' });
  }
  try {
    const result = await withUser(req.user.id, async (client) => {
      const { rows } = await client.query(
        `insert into client_groups (nama_kelompok, catatan) values ($1,$2) returning id`,
        [b.namaKelompok.trim(), b.catatan || null]
      );
      const group = rows[0];
      const anggota = Array.isArray(b.anggotaIds) ? b.anggotaIds : [];
      for (const individualClientId of anggota) {
        await client.query(
          `insert into client_group_members (client_group_id, individual_client_id)
           values ($1,$2) on conflict do nothing`,
          [group.id, individualClientId]
        );
      }
      return group;
    });
    res.status(201).json({ id: result.id });
  } catch (err) { next(mapPgError(err)); }
});

// POST /api/client-groups/:id/anggota  { individualClientId, peranDalamKelompok? }
router.post('/:id/anggota', async (req, res, next) => {
  const b = req.body || {};
  if (!b.individualClientId) return res.status(400).json({ error: 'individualClientId wajib disertakan.' });
  try {
    await queryAsUser(
      req.user.id,
      `insert into client_group_members (client_group_id, individual_client_id, peran_dalam_kelompok)
       values ($1,$2,$3) on conflict do nothing`,
      [req.params.id, b.individualClientId, b.peranDalamKelompok || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(mapPgError(err)); }
});

function mapPgError(err) {
  if (err.code === '42501') {
    return httpError(403, 'Hanya Managing Partner atau Admin Staf yang dapat mengelola klien kelompok.');
  }
  return err;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = router;
