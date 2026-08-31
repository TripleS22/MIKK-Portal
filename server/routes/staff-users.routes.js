// server/routes/staff-users.routes.js
//
// Pembuatan dan pengelolaan akun staf MIKK internal — dua kelompok peran
// (lihat app.is_mikk_admin(), db/02_rls_dan_views.sql):
//   admin      -> mikk_staff.jabatan in ('managing_partner','admin_staf')
//   pic_legal  -> mikk_staff.jabatan in ('senior_associate','associate')
// Berbeda dengan client-users.routes.js (akun customer): kata sandi awal
// akun staf TIDAK dikirim ke email — cuma ditampilkan sekali ke admin
// yang membuatnya (keputusan produk; lihat server/lib/email.js untuk
// alasan kenapa customer beda perlakuan).
//
// PERINGATAN SAMA seperti client-users.routes.js: tabel `users` TIDAK
// dilindungi RLS — pemeriksaan wajibAdminMikk() di sinilah SATU-SATUNYA
// penjaga untuk endpoint ini.

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { createAuthUser, updateAuthUserPassword } = require('../lib/supabase-auth');
const { authenticate } = require('../middleware/authenticate');
const { kataSandiAwal, wajibAdminMikk } = require('../lib/akun-helpers');

const router = express.Router();
router.use(authenticate);
router.use(wajibAdminMikk); // seluruh modul ini admin-only, tidak ada baca publik seperti Master Data

const JABATAN_PER_PERAN = {
  admin: ['managing_partner', 'admin_staf'],
  pic_legal: ['senior_associate', 'associate'],
};
const SEMUA_JABATAN = [...JABATAN_PER_PERAN.admin, ...JABATAN_PER_PERAN.pic_legal];

function peranDariJabatan(jabatan) {
  return JABATAN_PER_PERAN.admin.includes(jabatan) ? 'admin' : 'pic_legal';
}

// ---------------------------------------------------------------------
// GET /api/staff-users — daftar seluruh staf MIKK (admin & pic/legal)
// ---------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select u.id as user_id, u.nama, u.email, u.no_hp, u.aktif as user_aktif,
              ms.jabatan, ms.gelar, ms.aktif as staff_aktif
         from mikk_staff ms
         join users u on u.id = ms.user_id
        order by ms.jabatan, u.nama`);
    res.json({ rows: rows.map((r) => ({ ...r, peran: peranDariJabatan(r.jabatan) })) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/staff-users — buat akun staf baru
//
// Mengembalikan kata sandi awal SATU KALI, sama seperti client-users —
// TIDAK dikirim ke email (lihat catatan berkas di atas).
// ---------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  try {
    const email = String(b.email || '').trim().toLowerCase();
    const nama = String(b.nama || '').trim();
    const jabatan = b.jabatan;
    const gelar = b.gelar ? String(b.gelar).trim() : null;

    if (!nama) return res.status(400).json({ error: 'Nama wajib diisi.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (!SEMUA_JABATAN.includes(jabatan)) return res.status(400).json({ error: 'Jabatan tidak valid.' });

    const { rows: ada } = await queryAsUser(req.user.id,
      'select id, tipe from users where lower(email) = $1', [email]);
    if (ada.length) {
      return res.status(409).json({
        error: ada[0].tipe === 'mikk_staff'
          ? 'Email ini sudah terdaftar sebagai staf MIKK.'
          : 'Email ini sudah dipakai akun customer — tidak bisa dipakai ulang untuk akun staf.',
      });
    }

    const sandi = kataSandiAwal();
    // Akun Supabase Auth dibuat SEBELUM baris users, sama seperti pola
    // client-users.routes.js — supaya tidak ada baris users yatim kalau
    // langkah ini gagal (mis. email sudah dipakai di sisi Supabase).
    const akun = await createAuthUser(email, sandi);

    const userId = await withUser(req.user.id, async (client) => {
      const { rows: u } = await client.query(
        `insert into users (email, nama, tipe, no_hp, auth_user_id) values ($1,$2,'mikk_staff',$3,$4)
         returning id`, [email, nama, b.noHp || null, akun.id]);
      await client.query(
        `insert into mikk_staff (user_id, jabatan, gelar) values ($1,$2,$3)`,
        [u[0].id, jabatan, gelar]);
      return u[0].id;
    });

    res.status(201).json({ userId, kataSandiAwal: sandi });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PATCH /api/staff-users/:userId — ubah jabatan/gelar/aktif
// ---------------------------------------------------------------------
router.patch('/:userId', async (req, res, next) => {
  const b = req.body || {};
  try {
    if (b.jabatan !== undefined && !SEMUA_JABATAN.includes(b.jabatan)) {
      return res.status(400).json({ error: 'Jabatan tidak valid.' });
    }
    // nama ada di tabel users, sisanya (jabatan/gelar/aktif) di
    // mikk_staff -- dua UPDATE, satu transaksi (withUser), supaya tidak
    // ada perubahan setengah jalan kalau salah satunya gagal.
    let namaBaru;
    if (Object.prototype.hasOwnProperty.call(b, 'nama')) {
      namaBaru = String(b.nama || '').trim();
      if (!namaBaru) return res.status(400).json({ error: 'Nama tidak boleh kosong.' });
    }
    const set = [], val = [req.params.userId];
    const taruh = (k, v) => { val.push(v); set.push(`${k} = $${val.length}`); };
    if (Object.prototype.hasOwnProperty.call(b, 'jabatan')) taruh('jabatan', b.jabatan);
    if (Object.prototype.hasOwnProperty.call(b, 'gelar')) taruh('gelar', b.gelar || null);
    if (Object.prototype.hasOwnProperty.call(b, 'aktif')) taruh('aktif', !!b.aktif);
    if (!set.length && namaBaru === undefined) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });

    const userId = await withUser(req.user.id, async (client) => {
      if (set.length) {
        const { rows } = await client.query(
          `update mikk_staff set ${set.join(', ')} where user_id = $1 returning user_id`, val);
        if (!rows.length) throw Object.assign(new Error('Staf tidak ditemukan.'), { status: 404 });
      }
      if (namaBaru !== undefined) {
        const { rows } = await client.query(
          'update users set nama = $1 where id = $2 returning id', [namaBaru, req.params.userId]);
        if (!rows.length) throw Object.assign(new Error('Staf tidak ditemukan.'), { status: 404 });
      }
      return req.params.userId;
    });
    res.json({ userId });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/staff-users/:userId/reset-password
// ---------------------------------------------------------------------
router.post('/:userId/reset-password', async (req, res, next) => {
  try {
    const { rows: staf } = await queryAsUser(req.user.id,
      `select u.id, u.email, u.auth_user_id from users u
         join mikk_staff ms on ms.user_id = u.id
        where u.id = $1 limit 1`, [req.params.userId]);
    if (!staf.length) return res.status(404).json({ error: 'Staf tidak ditemukan.' });

    const sandi = kataSandiAwal();
    let authUserId = staf[0].auth_user_id;
    if (authUserId) {
      await updateAuthUserPassword(authUserId, sandi);
    } else {
      const akun = await createAuthUser(staf[0].email, sandi);
      authUserId = akun.id;
      await queryAsUser(req.user.id, 'update users set auth_user_id = $1 where id = $2',
        [authUserId, req.params.userId]);
    }
    res.json({ kataSandiAwal: sandi });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// GET /api/staff-users/:userId/cases — perkara yang PIC-nya staf ini,
// LINTAS jenis klien (perusahaan/perorangan/kelompok) dan lintas SEMUA
// klien firma (bukan cuma satu workspace) -- ini yang dilihat admin di
// halaman Detail Staf untuk memantau beban kerja/proses staf tsb.
// req.user.id di sini SELALU admin (seluruh router wajibAdminMikk),
// jadi is_mikk_admin() di RLS cases_baca (db/24) meloloskan semuanya
// terlepas siapa pic_legal_id-nya -- filter pic_legal_id=$1 di WHERE
// inilah yang benar-benar mempersempit ke staf yang dilihat.
// ---------------------------------------------------------------------
router.get('/:userId/cases', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select v.id, v.nomor_perkara, v.jenis_perkara, v.tahap, v.status_siklus,
              coalesce(o.nama_singkat, ic.nama, cg.nama_kelompok) as klien_nama,
              case when v.client_org_id is not null then 'perusahaan'
                   when v.individual_client_id is not null then 'perorangan'
                   else 'kelompok' end as klien_tipe,
              v.sidang_terdekat_tanggal, v.hari_ke_sidang
         from v_cases_display v
         left join client_orgs o on o.id = v.client_org_id
         left join individual_clients ic on ic.id = v.individual_client_id
         left join client_groups cg on cg.id = v.client_group_id
        where v.pic_legal_id = $1
        order by v.sidang_terdekat_tanggal nulls last, v.status_siklus`,
      [req.params.userId]);
    res.json({ rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// Riwayat staf — catatan bertanggal, cuma bisa DITAMBAH (bukan
// diedit/dihapus, lihat db/24_detail_staf.sql).
// ---------------------------------------------------------------------
router.get('/:userId/notes', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select n.id, n.isi, n.created_at, u.nama as created_by_nama
         from staff_notes n left join users u on u.id = n.created_by
        where n.user_id = $1 order by n.created_at desc`,
      [req.params.userId]);
    res.json({ rows });
  } catch (err) { next(err); }
});

router.post('/:userId/notes', async (req, res, next) => {
  const isi = String((req.body || {}).isi || '').trim();
  if (!isi) return res.status(400).json({ error: 'Isi catatan wajib diisi.' });
  try {
    const { rows } = await queryAsUser(req.user.id,
      `insert into staff_notes (user_id, isi, created_by) values ($1,$2,$3) returning id`,
      [req.params.userId, isi, req.user.id]);
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// Foto profil — SATU file terkini per staf (bukan arsip dokumen, lihat
// catatan db/24_detail_staf.sql), disimpan lewat storage.js yang sama
// dipakai dokumen biasa, jalur terpisah (foto/{userId}.{ext}) supaya
// gampang ditimpa tiap diganti (bukan menumpuk versi lama).
// ---------------------------------------------------------------------
const multer = require('multer');
const path = require('path');
const uploadFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const MIME_PER_EKSTENSI = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

router.post('/:userId/photo', uploadFoto.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Berkas foto wajib diunggah.' });
  const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
  if (!MIME_PER_EKSTENSI[ext]) return res.status(400).json({ error: 'Format foto tidak didukung — pakai JPG, PNG, WEBP, atau GIF.' });
  try {
    const { putFile } = require('../lib/storage');
    const fotoPath = `foto/${req.params.userId}${ext}`;
    const { rows } = await queryAsUser(req.user.id,
      'update users set foto_path = $1 where id = $2 returning id', [fotoPath, req.params.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Staf tidak ditemukan.' });
    await putFile(fotoPath, req.file.buffer);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:userId/photo', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      'select foto_path from users where id = $1', [req.params.userId]);
    if (!rows.length || !rows[0].foto_path) return res.status(404).json({ error: 'Belum ada foto.' });
    const { getFileBuffer } = require('../lib/storage');
    const buf = await getFileBuffer(rows[0].foto_path);
    if (!buf) return res.status(404).json({ error: 'Berkas foto tidak ditemukan di penyimpanan.' });
    const ext = path.extname(rows[0].foto_path).toLowerCase();
    res.setHeader('Content-Type', MIME_PER_EKSTENSI[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buf);
  } catch (err) { next(err); }
});

module.exports = router;
