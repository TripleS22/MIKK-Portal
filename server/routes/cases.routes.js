// server/routes/cases.routes.js
//
// Perkara bisa dimiliki salah satu dari TIGA jenis pihak — persis satu,
// ditegakkan lewat constraint cases_satu_pemilik (lihat
// 11_klien_perorangan_kelompok.sql): client_orgs (retainer korporat),
// individual_clients (perorangan), atau client_groups (kelompok/
// bareng-bareng). Endpoint di sini menerima clientOrgId ATAU
// individualClientId ATAU clientGroupId secara bergantian.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

// Membaca ketiga kemungkinan query param pemilik dan memastikan persis
// satu yang terisi. Dipakai oleh GET / dan GET /reference.
function pemilikDariQuery(q) {
  const { clientOrgId, individualClientId, clientGroupId } = q;
  const terisi = [clientOrgId, individualClientId, clientGroupId].filter(Boolean);
  if (terisi.length !== 1) return null;
  return { clientOrgId: clientOrgId || null, individualClientId: individualClientId || null, clientGroupId: clientGroupId || null };
}

// GET /api/cases?clientOrgId=  atau  ?individualClientId=  atau  ?clientGroupId=
router.get('/', async (req, res, next) => {
  const pemilik = pemilikDariQuery(req.query);
  if (!pemilik) {
    return res.status(400).json({ error: 'Sertakan persis satu dari clientOrgId, individualClientId, atau clientGroupId.' });
  }
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select * from v_cases_display
        where client_org_id is not distinct from $1
          and individual_client_id is not distinct from $2
          and client_group_id is not distinct from $3
        order by (status_siklus = 'aktif') desc, hari_ke_sidang nulls last, tanggal_daftar desc nulls last`,
      [pemilik.clientOrgId, pemilik.individualClientId, pemilik.clientGroupId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id, `select * from v_cases_dashboard where client_org_id = $1`, [clientOrgId]
    );
    res.json({
      dashboard: rows[0] || { client_org_id: clientOrgId, perkara_aktif: 0, sidang_hari_ini: 0, sidang_7_hari: 0, tahap_tertinggi: 0 },
    });
  } catch (err) { next(err); }
});

// GET /api/cases/reference?clientOrgId=|individualClientId=|clientGroupId=
// PIC diresolusi dari client_assignments untuk pemilik yang bersangkutan.
// Daftar tahap/peranKlien/statusSiklus di bawah adalah PRESET saja — sejak
// 13_opsi_bebas_isi_sendiri.sql, database tidak lagi menegakkan daftar
// tertutup ini; UI menawarkan opsi "Lainnya… (isi sendiri)" di sampingnya.
router.get('/reference', async (req, res, next) => {
  const pemilik = pemilikDariQuery(req.query);
  if (!pemilik) {
    return res.status(400).json({ error: 'Sertakan persis satu dari clientOrgId, individualClientId, atau clientGroupId.' });
  }
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select distinct u.id, u.nama, ms.jabatan from users u
         join client_assignments ca on ca.user_id = u.id
         left join mikk_staff ms on ms.user_id = u.id
        where ca.client_org_id is not distinct from $1
          and ca.individual_client_id is not distinct from $2
          and ca.client_group_id is not distinct from $3
          and (ca.selesai is null or ca.selesai >= current_date)
        order by u.nama`,
      [pemilik.clientOrgId, pemilik.individualClientId, pemilik.clientGroupId]
    );
    res.json({
      pic: rows,
      tahap: ['pendaftaran','mediasi','persidangan','pembuktian','putusan','banding','kasasi','pk','selesai'],
      peranKlien: ['penggugat','tergugat','pemohon','termohon','pelapor','terlapor','lainnya'],
      statusSiklus: ['aktif', 'selesai', 'dicabut'],
    });
  } catch (err) { next(err); }
});

// GET /api/cases/one/:id — termasuk daftar sidang & hearing minutes
router.get('/one/:id', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id, `select * from v_cases_display where id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Perkara tidak ditemukan, atau Anda tidak punya akses.' });
    const [hearings, minutes] = await Promise.all([
      queryAsUser(req.user.id,
        `select * from hearings where case_id = $1 order by tanggal_sidang desc, jam_sidang desc`, [req.params.id]),
      queryAsUser(req.user.id,
        `select m.*, u.nama as dicatat_oleh_nama from hearing_minutes m
           left join users u on u.id = m.dicatat_oleh
          where m.case_id = $1 order by m.created_at desc`, [req.params.id]),
    ]);
    res.json({ row: rows[0], hearings: hearings.rows, minutes: minutes.rows });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const b = req.body || {};
  const pemilik = [b.clientOrgId, b.individualClientId, b.clientGroupId].filter(Boolean);
  if (pemilik.length !== 1) {
    return res.status(400).json({ error: 'Sertakan persis satu dari clientOrgId, individualClientId, atau clientGroupId.' });
  }
  if (!b.nomorPerkara || !b.nomorPerkara.trim()) return res.status(400).json({ error: 'Nomor perkara wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into cases (client_org_id, individual_client_id, client_group_id,
                           nomor_perkara, jenis_perkara, peran_klien, lawan_pihak_teks,
                           pengadilan, tahap, status_siklus, tanggal_daftar, pic_legal_id, keterangan, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id`,
      [b.clientOrgId || null, b.individualClientId || null, b.clientGroupId || null,
       b.nomorPerkara.trim(), b.jenisPerkara || null, b.peranKlien || null,
       b.lawanPihakTeks || null, b.pengadilan || null, b.tahap || 'pendaftaran',
       b.statusSiklus || 'aktif', b.tanggalDaftar || null, b.picLegalId || null, b.keterangan || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = {
    nomor_perkara: b.nomorPerkara, jenis_perkara: b.jenisPerkara, peran_klien: b.peranKlien,
    lawan_pihak_teks: b.lawanPihakTeks, pengadilan: b.pengadilan, tahap: b.tahap,
    status_siklus: b.statusSiklus, tanggal_daftar: b.tanggalDaftar,
    pic_legal_id: b.picLegalId || null, keterangan: b.keterangan || null,
  };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id, `update cases set ${setSql} where id = $1 returning id`,
      [req.params.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) return res.status(404).json({ error: 'Perkara tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

// ---- Sidang ----
router.post('/:id/hearings', async (req, res, next) => {
  const b = req.body || {};
  if (!b.tanggalSidang) return res.status(400).json({ error: 'Tanggal sidang wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into hearings (case_id, tanggal_sidang, jam_sidang, agenda, status)
       values ($1,$2,$3,$4,$5) returning id`,
      [req.params.id, b.tanggalSidang, b.jamSidang || null, b.agenda || null, b.status || 'terjadwal']
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});
router.patch('/hearings/:hid', async (req, res, next) => {
  const b = req.body || {};
  const allowed = { tanggal_sidang: b.tanggalSidang, jam_sidang: b.jamSidang, agenda: b.agenda, status: b.status };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id, `update hearings set ${setSql} where id = $1 returning id`,
      [req.params.hid, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) return res.status(404).json({ error: 'Jadwal sidang tidak ditemukan.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// ---- Hearing minutes ----
router.post('/:id/minutes', async (req, res, next) => {
  const b = req.body || {};
  if (!b.isi || !b.isi.trim()) return res.status(400).json({ error: 'Isi catatan sidang wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into hearing_minutes (case_id, hearing_id, isi, status, dicatat_oleh)
       values ($1,$2,$3,$4,$5) returning id`,
      [req.params.id, b.hearingId || null, b.isi.trim(), b.status || 'draf', req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

function mapPgError(err) {
  if (err.code === '23505' && String(err.constraint || '').startsWith('cases_nomor_unik')) {
    return httpError(409, 'Nomor perkara ini sudah tercatat untuk klien yang sama.');
  }
  if (err.code === '42501') return httpError(403, 'Anda tidak memiliki akses untuk mengubah data ini.');
  return err;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = router;
