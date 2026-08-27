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

const router = express.Router();
router.use(authenticate);

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

module.exports = router;
