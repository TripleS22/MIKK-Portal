// server/routes/client-orgs.routes.js
//
// RLS pada client_orgs (lihat 02_rls_dan_views.sql + db/18_client_orgs_edit_klien.sql)
// sudah membatasi hasil dan siapa boleh menulis: staf MIKK
// (managing_partner/admin_staf) melihat semua & boleh edit semua;
// selain itu hanya organisasi tempat pengguna terdaftar, dan HANYA
// admin_klien organisasi itu sendiri yang boleh edit (bukan buat/hapus
// organisasi — itu tetap staf MIKK saja). Endpoint ini sekadar meneruskan.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { wajibAdminMikk } = require('../lib/akun-helpers');

const router = express.Router();
router.use(authenticate);

// POST /api/client-orgs — buat organisasi klien baru ("Klien Baru").
// RLS client_orgs_tulis (02_rls_dan_views.sql) sudah membatasi INSERT
// hanya untuk is_mikk_admin(); wajibAdminMikk di sini cuma supaya
// pesan tolaknya jelas SEBELUM menyentuh database (pola yang sama
// dipakai client-users/staff-users/permit-types.routes.js).
router.post('/', wajibAdminMikk, async (req, res, next) => {
  const b = req.body || {};
  const namaLegal = String(b.namaLegal || '').trim();
  const namaSingkat = String(b.namaSingkat || '').trim();
  if (!namaLegal) return res.status(400).json({ error: 'Nama legal wajib diisi.' });
  if (!namaSingkat) return res.status(400).json({ error: 'Nama singkat wajib diisi.' });
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into client_orgs
         (nama_legal, nama_singkat, npwp, nib, kbli, sektor_usaha, alamat, status_retainer)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id`,
      [
        namaLegal, namaSingkat, b.npwp || null, b.nib || null,
        Array.isArray(b.kbli) ? b.kbli : [], b.sektorUsaha || null, b.alamat || null,
        b.statusRetainer || 'aktif',
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Nama singkat "${namaSingkat}" sudah dipakai organisasi lain — pilih yang lain.` });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Status retainer tidak valid.' });
    }
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select id as client_org_id, nama_singkat, nama_legal, sektor_usaha, status_retainer
         from client_orgs order by nama_singkat`
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /api/client-orgs/:id — profil lengkap satu organisasi + apakah
// pengguna yang sedang login boleh mengeditnya (dipakai panel "Profil
// Perusahaan" di Dashboard untuk memunculkan/menyembunyikan tombol Edit).
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select id as client_org_id, nama_legal, nama_singkat, npwp, nib, kbli, sektor_usaha,
              alamat, logo_path, status_retainer, retainer_mulai, retainer_akhir,
              app.boleh_edit_klien(id) as boleh_edit
         from client_orgs where id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organisasi klien tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ row: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/client-orgs/:id — profil perusahaan. RLS
// (client_orgs_update_admin_klien / client_orgs_tulis) yang menegakkan
// siapa boleh — bukan pemeriksaan manual di sini.
router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  const allowed = {
    nama_legal: b.namaLegal, npwp: b.npwp, nib: b.nib,
    sektor_usaha: b.sektorUsaha, alamat: b.alamat,
    kbli: Array.isArray(b.kbli) ? b.kbli : undefined,
  };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `update client_orgs set ${setSql} where id = $1 returning id`,
      [req.params.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Organisasi klien tidak ditemukan, atau Anda tidak punya akses untuk mengubahnya.' });
    }
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '42501') {
      return next(Object.assign(new Error('Anda tidak memiliki akses untuk mengubah profil organisasi ini.'), { status: 403 }));
    }
    next(err);
  }
});

// ---------------------------------------------------------------------
// Field kustom profil perusahaan (db/22_client_org_custom_fields.sql) —
// bebas per klien, bukan skema terstruktur ala Master Data (lihat
// catatan panjang di migrasinya untuk alasannya). RLS
// (client_org_custom_fields_baca/tulis) yang menegakkan siapa boleh
// apa — sama persis app.boleh_akses_klien()/boleh_edit_klien() yang
// dipakai client_orgs sendiri, endpoint ini sekadar meneruskan.
// ---------------------------------------------------------------------

// GET /api/client-orgs/:id/custom-fields
router.get('/:id/custom-fields', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select id, label, nilai, urutan from client_org_custom_fields
        where client_org_id = $1 order by urutan, created_at`,
      [req.params.id]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// POST /api/client-orgs/:id/custom-fields — tambah field baru
router.post('/:id/custom-fields', async (req, res, next) => {
  const b = req.body || {};
  const label = String(b.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Nama field wajib diisi.' });
  try {
    const { rows: urutanRows } = await queryAsUser(req.user.id,
      'select count(*)::int as n from client_org_custom_fields where client_org_id = $1', [req.params.id]);
    const { rows } = await queryAsUser(
      req.user.id,
      `insert into client_org_custom_fields (client_org_id, label, nilai, urutan)
       values ($1,$2,$3,$4) returning id`,
      [req.params.id, label, b.nilai || null, urutanRows[0].n]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '42501') {
      return next(Object.assign(new Error('Anda tidak memiliki akses untuk mengubah profil organisasi ini.'), { status: 403 }));
    }
    next(err);
  }
});

// PATCH /api/client-orgs/custom-fields/:fieldId — ubah label/nilai/urutan
router.patch('/custom-fields/:fieldId', async (req, res, next) => {
  const b = req.body || {};
  const set = [], val = [req.params.fieldId];
  const taruh = (k, v) => { val.push(v); set.push(`${k} = $${val.length}`); };
  if (Object.prototype.hasOwnProperty.call(b, 'label')) {
    const label = String(b.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Nama field wajib diisi.' });
    taruh('label', label);
  }
  if (Object.prototype.hasOwnProperty.call(b, 'nilai')) taruh('nilai', b.nilai || null);
  if (Object.prototype.hasOwnProperty.call(b, 'urutan')) taruh('urutan', Number(b.urutan) || 0);
  if (!set.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });
  try {
    const { rows } = await queryAsUser(req.user.id,
      `update client_org_custom_fields set ${set.join(', ')} where id = $1 returning id`, val);
    if (!rows.length) return res.status(404).json({ error: 'Field tidak ditemukan, atau Anda tidak punya akses untuk mengubahnya.' });
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '42501') {
      return next(Object.assign(new Error('Anda tidak memiliki akses untuk mengubah profil organisasi ini.'), { status: 403 }));
    }
    next(err);
  }
});

// DELETE /api/client-orgs/custom-fields/:fieldId
router.delete('/custom-fields/:fieldId', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      'delete from client_org_custom_fields where id = $1 returning id', [req.params.fieldId]);
    if (!rows.length) return res.status(404).json({ error: 'Field tidak ditemukan, atau Anda tidak punya akses untuk menghapusnya.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
