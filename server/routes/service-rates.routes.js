// server/routes/service-rates.routes.js
//
// Pengelolaan tarif layanan. Penetapan tarif adalah keputusan bisnis,
// bukan pekerjaan administrasi — PRD Bagian 4 menyebut Managing Partner
// sebagai "satu-satunya yang dapat menetapkan tarif konsultasi".
//
// Penegakan sesungguhnya ada di RLS (kebijakan rates_tulis pada
// 02_rls_dan_views.sql). Pemeriksaan di berkas ini BUKAN pengganti itu,
// melainkan agar pengguna yang tidak berhak menerima pesan yang jelas
// ("hanya Managing Partner...") alih-alih galat RLS yang membingungkan.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

const JENIS = ['konsultasi_online', 'konsultasi_offline', 'konsultasi_luar_kota'];
const SATUAN = ['per_jam', 'per_sesi', 'per_hari'];
const TIER = ['managing_partner', 'senior_associate', 'associate', 'umum'];

/* Menolak lebih awal dengan pesan yang bisa dimengerti. Kalau pemeriksaan
   ini sampai terlewat, RLS tetap menahan penulisannya. */
async function wajibManagingPartner(req, res, next) {
  try {
    const { rows } = await queryAsUser(req.user.id, 'select app.is_managing_partner() as ok');
    if (!rows[0]?.ok) {
      return res.status(403).json({
        error: 'Hanya Managing Partner yang dapat mengubah tarif layanan.',
      });
    }
    next();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------
// GET /api/service-rates — termasuk yang nonaktif, untuk layar pengelolaan
// ---------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select id, kode, nama, deskripsi, jenis_layanan, tier, satuan, durasi_menit,
              harga, mata_uang, harga_termasuk_ppn, butuh_penawaran,
              berlaku_sejak, berlaku_sampai, aktif, urutan
         from service_rates
        where jenis_layanan = any($1)
        order by urutan, nama`, [JENIS]);
    const { rows: hak } = await queryAsUser(req.user.id, 'select app.is_managing_partner() as ok');
    res.json({ rows, bolehUbah: !!hak[0]?.ok });
  } catch (err) { next(err); }
});

/* Validasi bersama untuk create & update. Mengembalikan pesan galat, atau
   null bila lolos. */
function periksa(b, { wajibLengkap }) {
  if (wajibLengkap) {
    if (!String(b.kode || '').trim()) return 'Kode tarif wajib diisi.';
    if (!String(b.nama || '').trim()) return 'Nama tarif wajib diisi.';
    if (!JENIS.includes(b.jenisLayanan)) return 'Jenis layanan tidak valid.';
  }
  if (b.jenisLayanan !== undefined && !JENIS.includes(b.jenisLayanan)) return 'Jenis layanan tidak valid.';
  if (b.satuan !== undefined && !SATUAN.includes(b.satuan)) return 'Satuan tidak valid.';
  if (b.tier !== undefined && b.tier !== null && !TIER.includes(b.tier)) return 'Tier tidak valid.';

  const penawaran = !!b.butuhPenawaran;
  const adaHarga = b.harga !== undefined && b.harga !== null && b.harga !== '';
  // Constraint rates_harga_atau_penawaran di basis data menegakkan hal yang
  // sama; ditolak lebih awal supaya pesannya jelas, bukan galat constraint.
  if (penawaran && adaHarga) return 'Tarif yang memakai penawaran tidak boleh punya harga tetap.';
  if (!penawaran && wajibLengkap && !adaHarga) return 'Harga wajib diisi, kecuali tarif memakai penawaran.';
  if (adaHarga && !(Number(b.harga) >= 0)) return 'Harga harus berupa angka yang wajar.';
  if (b.durasiMenit != null && b.durasiMenit !== '' && !(Number(b.durasiMenit) > 0)) {
    return 'Durasi harus lebih dari nol menit.';
  }
  return null;
}

// ---------------------------------------------------------------------
// POST /api/service-rates
// ---------------------------------------------------------------------
router.post('/', wajibManagingPartner, async (req, res, next) => {
  const b = req.body || {};
  try {
    const salah = periksa(b, { wajibLengkap: true });
    if (salah) return res.status(400).json({ error: salah });

    const { rows } = await queryAsUser(req.user.id,
      `insert into service_rates
         (kode, nama, deskripsi, jenis_layanan, tier, satuan, durasi_menit, harga,
          harga_termasuk_ppn, butuh_penawaran, berlaku_sejak, berlaku_sampai,
          aktif, urutan, ditetapkan_oleh)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,current_date),$12,$13,$14,$15)
       returning id`,
      [String(b.kode).trim(), String(b.nama).trim(), b.deskripsi || null, b.jenisLayanan,
       b.tier || 'umum', b.satuan || 'per_jam',
       b.durasiMenit ? Number(b.durasiMenit) : null,
       b.butuhPenawaran ? null : Number(b.harga),
       !!b.hargaTermasukPpn, !!b.butuhPenawaran,
       b.berlakuSejak || null, b.berlakuSampai || null,
       b.aktif !== false, Number(b.urutan) || 0, req.user.id]);
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PATCH /api/service-rates/:id
//
// Catatan penting: mengubah tarif TIDAK mengubah pemesanan yang sudah
// terjadi — consultation_bookings menyimpan harga yang dibekukan saat
// pemesanan (lihat 08_fase3_schema.sql). Jadi perubahan di sini hanya
// berlaku untuk pemesanan berikutnya.
// ---------------------------------------------------------------------
router.patch('/:id', wajibManagingPartner, async (req, res, next) => {
  const b = req.body || {};
  try {
    const salah = periksa(b, { wajibLengkap: false });
    if (salah) return res.status(400).json({ error: salah });

    // PATCH berarti "ubah yang dikirim saja". Klausa SET dibangun HANYA
    // dari kunci yang benar-benar ada di badan permintaan — kalau tidak,
    // permintaan yang cuma mengubah harga akan diam-diam mengosongkan
    // durasi dan keterangan, dan kehilangan data seperti itu tidak
    // menimbulkan galat apa pun sampai ada yang menyadarinya di layar.
    const set = [];
    const val = [req.params.id];
    const taruh = (kolom, nilai) => { val.push(nilai); set.push(`${kolom} = $${val.length}`); };
    const ada = (k) => Object.prototype.hasOwnProperty.call(b, k);

    if (ada('nama'))            taruh('nama', String(b.nama).trim());
    if (ada('deskripsi'))       taruh('deskripsi', b.deskripsi || null);
    if (ada('tier'))            taruh('tier', b.tier);
    if (ada('satuan'))          taruh('satuan', b.satuan);
    if (ada('durasiMenit'))     taruh('durasi_menit', b.durasiMenit ? Number(b.durasiMenit) : null);
    if (ada('hargaTermasukPpn')) taruh('harga_termasuk_ppn', !!b.hargaTermasukPpn);
    if (ada('berlakuSampai'))   taruh('berlaku_sampai', b.berlakuSampai || null);
    if (ada('aktif'))           taruh('aktif', !!b.aktif);
    if (ada('urutan'))          taruh('urutan', Number(b.urutan) || 0);

    // Harga dan butuh_penawaran saling terkait: begitu memakai penawaran,
    // harga tetap WAJIB kosong (constraint rates_harga_atau_penawaran).
    if (ada('butuhPenawaran')) {
      taruh('butuh_penawaran', !!b.butuhPenawaran);
      if (b.butuhPenawaran) taruh('harga', null);
      else if (ada('harga')) taruh('harga', b.harga === '' || b.harga == null ? null : Number(b.harga));
    } else if (ada('harga')) {
      taruh('harga', b.harga === '' || b.harga == null ? null : Number(b.harga));
    }

    if (!set.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });
    taruh('ditetapkan_oleh', req.user.id);

    const { rows } = await queryAsUser(req.user.id,
      `update service_rates set ${set.join(', ')} where id = $1 returning id`, val);

    if (!rows.length) return res.status(404).json({ error: 'Tarif tidak ditemukan.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
