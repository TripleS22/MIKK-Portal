// server/routes/pendampingan.routes.js
const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { opsiKategori } = require('../lib/opsi-master');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select r.*, u.nama as pic_nama, ms.jabatan as pic_jabatan from pendampingan_requests r
         left join users u on u.id = r.pic_id
         left join mikk_staff ms on ms.user_id = u.id
        where r.client_org_id = $1
        order by (r.status = 'menunggu') desc, r.tanggal_kegiatan nulls last`,
      [clientOrgId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.get('/reference', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const [{ rows }, jenis, status] = await Promise.all([
      queryAsUser(
        req.user.id,
        `select distinct u.id, u.nama, ms.jabatan from users u
           join client_assignments ca on ca.user_id = u.id
           left join mikk_staff ms on ms.user_id = u.id
          where ca.client_org_id = $1 and (ca.selesai is null or ca.selesai >= current_date)
          order by u.nama`,
        [clientOrgId]
      ),
      opsiKategori(queryAsUser, req.user.id, 'pendampingan_jenis'),
      opsiKategori(queryAsUser, req.user.id, 'pendampingan_status'),
    ]);
    res.json({ pic: rows, jenis, status });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
  if (!b.jenis) return res.status(400).json({ error: 'Jenis pendampingan wajib dipilih.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into pendampingan_requests
         (client_org_id, jenis, tanggal_kegiatan, lokasi, pihak_terlibat, deskripsi, status, pic_id, requested_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [b.clientOrgId, b.jenis, b.tanggalKegiatan || null, b.lokasi || null, b.pihakTerlibat || null,
       b.deskripsi || null, b.status || 'menunggu', b.picId || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = {
    jenis: b.jenis, tanggal_kegiatan: b.tanggalKegiatan || null, lokasi: b.lokasi,
    pihak_terlibat: b.pihakTerlibat, deskripsi: b.deskripsi, status: b.status,
    pic_id: b.picId || null,
  };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id, `update pendampingan_requests set ${setSql} where id = $1 returning id`,
      [req.params.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) return res.status(404).json({ error: 'Permintaan tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
