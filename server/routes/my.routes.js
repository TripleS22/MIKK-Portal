// server/routes/my.routes.js
//
// Dashboard pribadi — SEMUA perkara yang ditugaskan ke pengguna yang
// sedang login (sebagai PIC atau lewat client_assignments), lintas jenis
// klien (retainer korporat seperti NHC, perorangan, atau kelompok/
// bareng-bareng). Beda dari GET /api/cases, yang selalu terikat pada satu
// clientOrgId/individualClientId/clientGroupId (satu workspace terpilih).
//
// Tidak ada policy RLS baru di sini — app.boleh_akses_pihak() (lihat
// 12_klien_perorangan_kelompok_rls.sql) sudah cukup: baris yang memang
// ditugaskan ke pengguna otomatis lolos lewat RLS itu juga.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { CASES_MILIK_SAYA_SQL } = require('../lib/my-cases-query');

const router = express.Router();
router.use(authenticate);

router.get('/cases', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `${CASES_MILIK_SAYA_SQL}
        order by (status_siklus = 'aktif') desc, hari_ke_sidang nulls last, tanggal_daftar desc nulls last`
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select
         count(*) filter (where status_siklus = 'aktif')        as perkara_aktif,
         count(*) filter (where hari_ke_sidang between 0 and 7)  as sidang_7_hari,
         count(*) filter (where jenis_klien = 'retainer')        as klien_retainer,
         count(*) filter (where jenis_klien = 'perorangan')      as klien_perorangan,
         count(*) filter (where jenis_klien = 'kelompok')        as klien_kelompok
       from (${CASES_MILIK_SAYA_SQL}) x`
    );
    res.json({
      summary: rows[0] || {
        perkara_aktif: 0, sidang_7_hari: 0, klien_retainer: 0, klien_perorangan: 0, klien_kelompok: 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
