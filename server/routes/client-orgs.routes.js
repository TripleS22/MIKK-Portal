// server/routes/client-orgs.routes.js
//
// RLS pada client_orgs (lihat 02_rls_dan_views.sql) sudah membatasi hasil:
// staf MIKK (managing_partner/admin_staf) melihat semua, selain itu hanya
// organisasi tempat pengguna terdaftar. Endpoint ini sekadar meneruskan.

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

module.exports = router;
