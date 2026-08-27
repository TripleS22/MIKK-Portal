// server/routes/permits.routes.js
//
// Pola yang sama dengan contracts.routes.js: semua query lewat
// queryAsUser()/withUser() supaya RLS (02_rls_dan_views.sql) yang
// menegakkan isolasi antar klien — bukan pemeriksaan manual di sini.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { opsiKategori } = require('../lib/opsi-master');

const router = express.Router();
router.use(authenticate);

const SELECT_ONE = `
  select id, client_org_id, permit_type_id, nama_izin, nomor_izin, instansi_penerbit,
         tanggal_terbit, tanggal_kedaluwarsa, tanpa_batas_waktu, status_siklus,
         pic_id, keterangan, sisa_hari, status_waktu
    from v_permits_display`;

// GET /api/permits?clientOrgId=
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `${SELECT_ONE} where client_org_id = $1 order by tanggal_kedaluwarsa nulls last, nama_izin`,
      [clientOrgId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /api/permits/dashboard?clientOrgId=  — kartu ringkasan, definisi terkunci
// di satu tempat supaya semua layar menampilkan angka yang sama (lihat P1
// di spesifikasi: status waktu selalu dihitung, tidak pernah disimpan).
router.get('/dashboard', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select
         count(*) filter (where status_siklus <> 'dicabut')                       as total_izin,
         count(*) filter (where status_waktu in ('aman','pantau','tanpa_batas'))   as izin_aktif,
         count(*) filter (where status_waktu in ('peringatan','kritis'))           as akan_berakhir,
         count(*) filter (where status_waktu = 'kedaluwarsa')                      as kedaluwarsa,
         count(*) filter (where status_siklus = 'dalam_pengurusan')                as dalam_pengurusan
       from v_permits_display where client_org_id = $1`,
      [clientOrgId]
    );
    const { rows: gapRows } = await queryAsUser(
      req.user.id,
      `select count(*)::int as n from v_permit_gap where client_org_id = $1 and wajib`,
      [clientOrgId]
    );
    res.json({ dashboard: { ...rows[0], gap_wajib: gapRows[0]?.n || 0 } });
  } catch (err) { next(err); }
});

// GET /api/permits/gap?clientOrgId=
router.get('/gap', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select * from v_permit_gap where client_org_id = $1 order by wajib desc, nama`,
      [clientOrgId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /api/permits/reference?clientOrgId=  — jenis izin master & PIC yang bisa dipilih
router.get('/reference', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const [types, pic, statusSiklus] = await Promise.all([
      queryAsUser(req.user.id,
        `select id, kode, nama, instansi, wajib from permit_types
          where masih_berlaku order by wajib desc, nama`),
      queryAsUser(req.user.id,
        `select distinct u.id, u.nama, ms.jabatan
           from users u join client_assignments ca on ca.user_id = u.id
           left join mikk_staff ms on ms.user_id = u.id
          where ca.client_org_id = $1 and (ca.selesai is null or ca.selesai >= current_date)
          order by u.nama`,
        [clientOrgId]),
      opsiKategori(queryAsUser, req.user.id, 'permits_status_siklus'),
    ]);
    res.json({ permitTypes: types.rows, pic: pic.rows, statusSiklus });
  } catch (err) { next(err); }
});

// GET /api/permits/one/:id
router.get('/one/:id', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id, `${SELECT_ONE} where id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Izin tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ row: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/permits
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
  if (!b.namaIzin || !b.namaIzin.trim()) return res.status(400).json({ error: 'Nama izin wajib diisi.' });

  try {
    const result = await withUser(req.user.id, async (client) => {
      const { rows } = await client.query(
        `insert into permits
           (client_org_id, permit_type_id, nama_izin, nomor_izin, instansi_penerbit,
            tanggal_terbit, tanggal_kedaluwarsa, tanpa_batas_waktu, status_siklus, pic_id, keterangan)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning id`,
        [
          b.clientOrgId, b.permitTypeId || null, b.namaIzin.trim(), b.nomorIzin || null,
          b.instansiPenerbit || null, b.tanggalTerbit || null,
          b.tanpaBatas ? null : (b.tanggalKedaluwarsa || null), !!b.tanpaBatas,
          b.status || 'aktif', b.picId || null, b.keterangan || null,
        ]
      );
      return rows[0];
    });
    res.status(201).json({ id: result.id });
  } catch (err) { next(mapPgError(err)); }
});

// PATCH /api/permits/:id
router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = {
    permit_type_id: b.permitTypeId, nama_izin: b.namaIzin, nomor_izin: b.nomorIzin,
    instansi_penerbit: b.instansiPenerbit, tanggal_terbit: b.tanggalTerbit,
    tanggal_kedaluwarsa: b.tanpaBatas ? null : b.tanggalKedaluwarsa,
    tanpa_batas_waktu: b.tanpaBatas, status_siklus: b.status,
    pic_id: b.picId || null, keterangan: b.keterangan || null,
  };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => allowed[c]);

  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `update permits set ${setSql} where id = $1 returning id`,
      [req.params.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'Izin tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

function mapPgError(err) {
  if (err.code === '23514') {
    const m = {
      permits_tanpa_batas_konsisten: 'Izin ditandai tanpa batas waktu, jadi tanggal kedaluwarsa harus kosong.',
      permits_tgl_masuk_akal: 'Tanggal kedaluwarsa tidak boleh mendahului tanggal terbit.',
    };
    return httpError(422, m[err.constraint] || 'Data tidak memenuhi aturan validasi.');
  }
  if (err.code === '42501') return httpError(403, 'Anda tidak memiliki akses untuk mengubah data ini.');
  return err;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = router;
