// server/routes/master-data.routes.js
//
// Kelola opsi dropdown (tahap perkara, status kontrak, dst.) yang
// sebelumnya array hardcode di tiap endpoint /reference (lihat
// db/17_master_data_opsi.sql). RLS (opsi_master_baca/tulis) yang
// menegakkan siapa boleh apa — baca terbuka untuk siapa saja yang
// login, tulis hanya Managing Partner/Admin Staf.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

// Daftar kategori yang sah — dijaga di sini juga (bukan cuma dokumentasi)
// supaya salah ketik kategori tidak diam-diam membuat kategori baru yang
// tidak dipakai endpoint /reference mana pun.
const KATEGORI = [
  'cases_tahap', 'cases_peran_klien', 'cases_status_siklus',
  'contracts_status_siklus', 'contracts_jenis_dokumen', 'contracts_relasi_ke_induk',
  'permits_status_siklus', 'legal_projects_status',
  'pendampingan_jenis', 'pendampingan_status',
];

// GET /api/master-data?kategori=  — tanpa kategori: semua, dikelompokkan.
router.get('/', async (req, res, next) => {
  try {
    const { kategori } = req.query;
    if (kategori && !KATEGORI.includes(kategori)) {
      return res.status(400).json({ error: 'Kategori tidak dikenal.' });
    }
    const { rows } = await queryAsUser(
      req.user.id,
      `select id, kategori, kode, label_id, label_en, urutan, aktif, created_at
         from opsi_master
        where $1::text is null or kategori = $1
        order by kategori, urutan, label_id`,
      [kategori || null]
    );
    res.json({ rows, kategoriTersedia: KATEGORI });
  } catch (err) { next(err); }
});

// POST /api/master-data — tambah opsi baru (RLS menolak kalau bukan admin).
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!KATEGORI.includes(b.kategori)) return res.status(400).json({ error: 'Kategori tidak dikenal.' });
  if (!b.kode || !String(b.kode).trim()) return res.status(400).json({ error: 'Kode wajib diisi.' });
  if (!b.labelId || !String(b.labelId).trim()) return res.status(400).json({ error: 'Label (Indonesia) wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into opsi_master (kategori, kode, label_id, label_en, urutan)
       values ($1,$2,$3,$4,$5) returning id`,
      [b.kategori, String(b.kode).trim(), String(b.labelId).trim(), b.labelEn || null, b.urutan ?? 0]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

// PATCH /api/master-data/:id — ubah label/urutan/aktif. TIDAK ADA hapus
// keras: opsi yang sudah pernah dipakai baris lama tidak boleh yatim —
// nonaktifkan saja (aktif=false), dropdown berhenti menawarkannya tapi
// baris lama tetap tampil apa adanya.
router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = { label_id: b.labelId, label_en: b.labelEn, urutan: b.urutan, aktif: b.aktif };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `update opsi_master set ${setSql} where id = $1 returning id`,
      [req.params.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) return res.status(404).json({ error: 'Opsi tidak ditemukan.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(mapPgError(err)); }
});

function mapPgError(err) {
  if (err.code === '23505') return httpError(409, 'Kode ini sudah ada di kategori tersebut.');
  if (err.code === '42501') return httpError(403, 'Hanya Managing Partner atau Admin Staf yang dapat mengubah Master Data.');
  return err;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

module.exports = router;
