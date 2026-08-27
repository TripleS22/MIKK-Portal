// server/routes/permit-types.routes.js
//
// Kelola "Jenis Izin" (permit_types) — daftar referensi hukum yang
// dipakai dropdown "Jenis Izin" di modul Perizinan (permits.routes.js
// /reference) DAN gap analysis (v_permit_gap, db/02_rls_dan_views.sql).
// Bukan bagian tabel generik opsi_master (db/17_master_data_opsi.sql —
// lihat db/21_permit_types_master_data.sql untuk alasannya: permit_types
// punya kolom yang tidak dimiliki kategori Master Data lain).
//
// Tidak dihapus keras — masih_berlaku dipakai sebagai nonaktif/aktif,
// sama prinsipnya dengan opsi_master.aktif: jenis izin yang sudah
// pernah dipakai (permits.permit_type_id) tidak boleh jadi yatim.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { wajibAdminMikk } = require('../lib/akun-helpers');

const router = express.Router();
router.use(authenticate);

// GET /api/permit-types — daftar LENGKAP (aktif & nonaktif), untuk layar
// kelola. Beda dari permits.routes.js GET /reference (yang cuma
// masih_berlaku) — di sini admin perlu melihat yang nonaktif juga supaya
// bisa diaktifkan lagi. Baca boleh siapa saja login (RLS permit_types_baca
// — bukan data rahasia klien), tulis digerbangi per-endpoint di bawah.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select id, kode, nama, instansi, masa_berlaku_bulan, kbli_terkait, wajib, masih_berlaku, catatan
         from permit_types order by wajib desc, nama`);
    const { rows: hak } = await queryAsUser(req.user.id, 'select app.is_mikk_admin() as ok');
    res.json({ rows, bolehKelola: !!hak[0]?.ok });
  } catch (err) { next(err); }
});

// POST /api/permit-types — tambah jenis izin baru
router.post('/', wajibAdminMikk, async (req, res, next) => {
  const b = req.body || {};
  try {
    const kode = String(b.kode || '').trim();
    const nama = String(b.nama || '').trim();
    if (!kode || !nama) return res.status(400).json({ error: 'Kode dan nama wajib diisi.' });

    const kbli = Array.isArray(b.kbliTerkait) ? b.kbliTerkait.map((k) => String(k).trim()).filter(Boolean) : [];

    const hasil = await withUser(req.user.id, (client) => client.query(
      `insert into permit_types (kode, nama, instansi, masa_berlaku_bulan, kbli_terkait, wajib, catatan)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [kode, nama, b.instansi || null, b.masaBerlakuBulan || null, kbli, !!b.wajib, b.catatan || null]
    ));
    res.status(201).json({ id: hasil.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Kode jenis izin ini sudah dipakai.' });
    next(err);
  }
});

// PATCH /api/permit-types/:id — ubah field, termasuk nonaktifkan/aktifkan
router.patch('/:id', wajibAdminMikk, async (req, res, next) => {
  const b = req.body || {};
  try {
    const set = [], val = [req.params.id];
    const taruh = (k, v) => { val.push(v); set.push(`${k} = $${val.length}`); };
    if (Object.prototype.hasOwnProperty.call(b, 'nama')) taruh('nama', String(b.nama).trim());
    if (Object.prototype.hasOwnProperty.call(b, 'instansi')) taruh('instansi', b.instansi || null);
    if (Object.prototype.hasOwnProperty.call(b, 'masaBerlakuBulan')) taruh('masa_berlaku_bulan', b.masaBerlakuBulan || null);
    if (Object.prototype.hasOwnProperty.call(b, 'kbliTerkait')) {
      const kbli = Array.isArray(b.kbliTerkait) ? b.kbliTerkait.map((k) => String(k).trim()).filter(Boolean) : [];
      taruh('kbli_terkait', kbli);
    }
    if (Object.prototype.hasOwnProperty.call(b, 'wajib')) taruh('wajib', !!b.wajib);
    if (Object.prototype.hasOwnProperty.call(b, 'catatan')) taruh('catatan', b.catatan || null);
    if (Object.prototype.hasOwnProperty.call(b, 'masihBerlaku')) taruh('masih_berlaku', !!b.masihBerlaku);
    if (!set.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });

    const { rows } = await queryAsUser(req.user.id,
      `update permit_types set ${set.join(', ')} where id = $1 returning id`, val);
    if (!rows.length) return res.status(404).json({ error: 'Jenis izin tidak ditemukan.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
