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
      // 'supervisi' dikecualikan — peran pengawasan, bukan penanggung jawab
      // proyek (sama seperti permits.routes.js /reference).
      `select distinct u.id, u.nama, ms.jabatan from users u
         join client_assignments ca on ca.user_id = u.id
         left join mikk_staff ms on ms.user_id = u.id
        where ca.client_org_id = $1 and ca.peran in ('pic_utama','pendukung')
          and (ca.selesai is null or ca.selesai >= current_date)
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
      // progress_persen TIDAK diterima dari badan permintaan -- proyek baru
      // selalu mulai 0 dan angkanya sesudah itu dihitung dari tahapan yang
      // dicentang (trigger di db/26_project_milestones.sql), bukan diketik.
      `insert into legal_projects (client_org_id, nama_proyek, kategori, pic_legal_id,
                                    progress_persen, status, target_selesai, keterangan, created_by)
       values ($1,$2,$3,$4,0,$5,$6,$7,$8) returning id`,
      [b.clientOrgId, b.namaProyek.trim(), b.kategori || null, b.picLegalId || null,
       b.status || 'berjalan', b.targetSelesai || null, b.keterangan || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  // progress_persen sengaja TIDAK ada di daftar ini: sejak
  // db/26_project_milestones.sql angkanya dihitung dari tahapan yang
  // dicentang, bukan diisi tangan. Kalau tetap dikirim klien, diabaikan
  // -- bukan ditolak dengan error, supaya klien versi lama tidak rusak.
  const allowed = {
    nama_proyek: b.namaProyek, kategori: b.kategori, pic_legal_id: b.picLegalId || null,
    status: b.status, target_selesai: b.targetSelesai || null,
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

/* ------------------------------------------------------------------
   TAHAPAN PROYEK — parameter yang menentukan progres.

   Tidak ada endpoint "set progres" di sini dengan sengaja: satu-satunya
   cara angka itu berubah adalah lewat tahapan yang dicentang, dihitung
   trigger di basis data (db/26_project_milestones.sql), bukan dihitung
   di sini lalu ikut dikirim. Jadi angkanya tetap benar walau baris
   tahapan diubah dari mana pun -- termasuk langsung lewat SQL.

   Hak akses ditegakkan RLS project_milestones_baca/_tulis (yang syarat
   tulisnya disalin persis dari legal_projects_tulis); tidak ada
   pengecekan kepemilikan tambahan di sini, sama seperti endpoint lain
   di proyek ini.
   ------------------------------------------------------------------ */
router.get('/:id/milestones', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select id, project_id, nama, urutan, selesai, tanggal_selesai
         from project_milestones where project_id = $1 order by urutan, created_at`,
      [req.params.id]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.post('/:id/milestones', async (req, res, next) => {
  const b = req.body || {};
  if (!b.nama || !b.nama.trim()) return res.status(400).json({ error: 'Nama tahapan wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      // urutan default = paling belakang, dihitung di SQL supaya dua orang
      // yang menambah tahapan bersamaan tidak dapat urutan yang sama.
      `insert into project_milestones (project_id, nama, urutan)
       values ($1, $2, coalesce((select max(urutan) + 1 from project_milestones where project_id = $1), 1))
       returning id`,
      [req.params.id, b.nama.trim()]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/milestones/:mid', async (req, res, next) => {
  const b = req.body || {};
  if (b.selesai === undefined && b.nama === undefined) {
    return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  }
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `update project_milestones
          set nama = coalesce($2, nama),
              selesai = coalesce($3, selesai),
              -- tanggal selesai diisi/dikosongkan mengikuti centangnya,
              -- bukan kolom terpisah yang bisa berbeda dari kenyataan.
              tanggal_selesai = case when $3 is null then tanggal_selesai
                                     when $3 then current_date else null end
        where id = $1 returning id`,
      [req.params.mid, b.nama === undefined ? null : String(b.nama).trim(),
       b.selesai === undefined ? null : !!b.selesai]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tahapan tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

router.delete('/milestones/:mid', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id, `delete from project_milestones where id = $1 returning id`, [req.params.mid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tahapan tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
