// server/routes/profile.routes.js
//
// "Profil Saya" — satu layar per peran: identitas + data legalitas milik
// peran itu, daftar proyek/perkara yang ditangani, dan (lewat
// GET /api/documents?...&entityType=&entityId=, yang sudah ada) dokumen
// milik proyek/perkara yang dipilih. Tidak ada endpoint dokumen baru di
// sini — panel dokumen di frontend memanggil ulang endpoint dokumen yang
// sudah ada, per proyek yang dipilih dari daftar di bawah.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { CASES_MILIK_SAYA_SQL } = require('../lib/my-cases-query');

const router = express.Router();
router.use(authenticate);

router.get('/me', async (req, res, next) => {
  try {
    const { rows: userRows } = await queryAsUser(
      req.user.id, `select id, email, nama, no_hp, tipe from users where id = $1`, [req.user.id]
    );
    if (!userRows.length) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    const user = userRows[0];

    let legalitas = null;
    if (user.tipe === 'mikk_staff') {
      const { rows } = await queryAsUser(
        req.user.id,
        `select jabatan, gelar, nomor_izin_advokat, nik, alamat from mikk_staff where user_id = $1`,
        [req.user.id]
      );
      legalitas = { tipe: 'staf', ...(rows[0] || {}) };
    } else if (user.tipe === 'client_user') {
      const { rows } = await queryAsUser(
        req.user.id,
        `select o.id as client_org_id, o.nama_legal, o.nama_singkat, o.npwp, o.nib, o.alamat, cm.peran
           from client_memberships cm join client_orgs o on o.id = cm.client_org_id
          where cm.user_id = $1 and cm.aktif`,
        [req.user.id]
      );
      legalitas = { tipe: 'klien', organisasi: rows };
    }
    res.json({ user, legalitas });
  } catch (err) { next(err); }
});

// PATCH /api/profile/me — staf mengedit data legalitas miliknya sendiri.
// Data organisasi klien (npwp/nib/alamat) tetap dikelola staf MIKK lewat
// layar klien seperti sekarang, bukan lewat sini.
router.patch('/me', async (req, res, next) => {
  const b = req.body || {};
  const allowed = { gelar: b.gelar, nomor_izin_advokat: b.nomorIzinAdvokat, nik: b.nik, alamat: b.alamat };
  const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
  if (!cols.length) return res.status(400).json({ error: 'Tidak ada kolom yang diperbarui.' });
  const setSql = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `update mikk_staff set ${setSql} where user_id = $1 returning user_id`,
      [req.user.id, ...cols.map((c) => allowed[c])]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Hanya staf MIKK yang punya data legalitas untuk diperbarui.' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me/projects', async (req, res, next) => {
  try {
    const { rows: userRows } = await queryAsUser(req.user.id, `select tipe from users where id = $1`, [req.user.id]);
    const tipe = userRows[0]?.tipe;

    if (tipe === 'mikk_staff') {
      const { rows } = await queryAsUser(
        req.user.id,
        `select 'perkara' as jenis, x.id, x.nomor_perkara as judul, x.status_siklus as status,
                x.klien_nama, x.jenis_klien as klien_jenis,
                x.client_org_id, x.individual_client_id, x.client_group_id
           from (${CASES_MILIK_SAYA_SQL}) x
          union all
          select 'proyek' as jenis, p.id, p.nama_proyek as judul, p.status,
                 o.nama_singkat as klien_nama, 'retainer' as klien_jenis,
                 p.client_org_id, null::uuid, null::uuid
           from legal_projects p join client_orgs o on o.id = p.client_org_id
          where p.pic_legal_id = app.current_user_id()
          union all
          select 'kontrak' as jenis, k.id, k.judul, k.status_siklus,
                 o.nama_singkat as klien_nama, 'retainer' as klien_jenis,
                 k.client_org_id, null::uuid, null::uuid
           from contracts k join client_orgs o on o.id = k.client_org_id
          where k.pic_legal_id = app.current_user_id()
          order by jenis, judul`
      );
      res.json({ rows });
    } else {
      // Klien: cukup daftar perkara/proyek/kontrak organisasinya sendiri —
      // RLS (boleh_akses_klien) sudah membatasi hasilnya ke org tempat ia
      // terdaftar, jadi tidak perlu filter tambahan di sini.
      const { rows } = await queryAsUser(
        req.user.id,
        `select 'perkara' as jenis, c.id, c.nomor_perkara as judul, c.status_siklus as status,
                o.nama_singkat as klien_nama, 'retainer' as klien_jenis,
                c.client_org_id, null::uuid, null::uuid
           from cases c join client_orgs o on o.id = c.client_org_id
          union all
          select 'proyek', p.id, p.nama_proyek, p.status, o.nama_singkat, 'retainer', p.client_org_id, null, null
           from legal_projects p join client_orgs o on o.id = p.client_org_id
          union all
          select 'kontrak', k.id, k.judul, k.status_siklus, o.nama_singkat, 'retainer', k.client_org_id, null, null
           from contracts k join client_orgs o on o.id = k.client_org_id
          order by jenis, judul`
      );
      res.json({ rows });
    }
  } catch (err) { next(err); }
});

module.exports = router;
