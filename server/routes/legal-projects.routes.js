// server/routes/legal-projects.routes.js
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
      `select * from v_legal_projects_display where client_org_id = $1
        order by (status = 'berjalan') desc, sisa_hari nulls last`,
      [clientOrgId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id, `select * from v_legal_projects_dashboard where client_org_id = $1`, [clientOrgId]
    );
    res.json({
      dashboard: rows[0] || { client_org_id: clientOrgId, total_proyek: 0, selesai: 0, berjalan: 0, tertunda: 0, segera_selesai: 0, terlambat: 0 },
    });
  } catch (err) { next(err); }
});

router.get('/reference', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select distinct u.id, u.nama, ms.jabatan from users u
         join client_assignments ca on ca.user_id = u.id
         left join mikk_staff ms on ms.user_id = u.id
        where ca.client_org_id = $1 and (ca.selesai is null or ca.selesai >= current_date)
        order by u.nama`,
      [clientOrgId]
    );
    const status = await opsiKategori(queryAsUser, req.user.id, 'legal_projects_status');
    res.json({ pic: rows, status });
  } catch (err) { next(err); }
});

router.get('/one/:id', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id, `select * from v_legal_projects_display where id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Proyek tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ row: rows[0] });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
  if (!b.namaProyek || !b.namaProyek.trim()) return res.status(400).json({ error: 'Nama proyek wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into legal_projects (client_org_id, nama_proyek, kategori, pic_legal_id,
                                    progress_persen, status, target_selesai, keterangan, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [b.clientOrgId, b.namaProyek.trim(), b.kategori || null, b.picLegalId || null,
       b.progressPersen ?? 0, b.status || 'berjalan', b.targetSelesai || null, b.keterangan || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = {
    nama_proyek: b.namaProyek, kategori: b.kategori, pic_legal_id: b.picLegalId || null,
    progress_persen: b.progressPersen, status: b.status, target_selesai: b.targetSelesai || null,
    keterangan: b.keterangan || null,
  };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id, `update legal_projects set ${setSql} where id = $1 returning id`,
      [req.params.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proyek tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
