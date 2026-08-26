// server/routes/client-users.routes.js
//
// Pembuatan dan pengelolaan akun pengguna sisi klien.
//
// PERINGATAN YANG HARUS DIBACA SEBELUM MENGUBAH BERKAS INI:
//
// Tabel `users` TIDAK dilindungi RLS (lihat 02_rls_dan_views.sql — tabel
// itu sengaja tidak ikut di-enable karena login harus bisa membacanya
// sebelum ada sesi). Artinya untuk tabel ini, pemeriksaan di route inilah
// SATU-SATUNYA penjaga. Berbeda dengan modul lain di sistem ini, kelalaian
// di sini tidak akan tertahan oleh basis data.
//
// Yang masih dilindungi RLS: client_memberships hanya bisa ditulis
// app.is_mikk_admin() (managing_partner / admin_staf). Batas itu sudah
// menjadi keputusan desain sejak Fase 1 dan TIDAK dilonggarkan di sini —
// admin sisi klien tetap tidak bisa menambah anggota organisasinya
// sendiri. Kalau kelak diinginkan, ubah kebijakan RLS-nya secara sadar,
// bukan dengan menambal di lapisan aplikasi.

const express = require('express');
const crypto = require('crypto');
const { queryAsUser, withUser } = require('../lib/db');
const { hashPassword } = require('../lib/auth');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

const PERAN = ['admin_klien', 'legal_manager', 'viewer'];

/* Kata sandi awal dibuat sistem, bukan diketik admin. Admin yang mengetik
   sendiri cenderung memilih pola yang mudah ditebak dan memakainya ulang
   untuk banyak klien. Nilai ini ditampilkan SEKALI ke admin lalu tidak
   pernah bisa dibaca lagi — yang tersimpan hanya hash bcrypt-nya. */
function kataSandiAwal() {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const acak = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 14; i++) s += abjad[acak[i] % abjad.length];
  return s;
}

/* Hanya Managing Partner & Admin Staf. Sama dengan batas yang sudah
   ditegakkan RLS pada client_memberships — disebutkan lagi di sini agar
   penolakannya berpesan jelas, dan karena tabel users tidak punya RLS. */
async function wajibAdminMikk(req, res, next) {
  try {
    const { rows } = await queryAsUser(req.user.id, 'select app.is_mikk_admin() as ok');
    if (!rows[0]?.ok) {
      return res.status(403).json({
        error: 'Hanya Managing Partner atau Admin Staf yang dapat mengelola akun klien.',
      });
    }
    next();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------
// GET /api/client-users?clientOrgId=
// Daftar anggota satu organisasi klien. Dibaca lewat RLS
// (memberships_baca), jadi pengguna klien pun boleh melihat rekan
// seorganisasinya — tapi tidak organisasi lain.
// ---------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

    const { rows } = await queryAsUser(req.user.id,
      `select cm.id as membership_id, cm.peran, cm.aktif as membership_aktif, cm.created_at,
              u.id as user_id, u.nama, u.email, u.no_hp, u.aktif as user_aktif,
              (la.user_id is not null) as punya_sandi
         from client_memberships cm
         join users u on u.id = cm.user_id
         left join local_auth la on la.user_id = u.id
        where cm.client_org_id = $1
        order by cm.peran, u.nama`,
      [clientOrgId]);

    const { rows: hak } = await queryAsUser(req.user.id, 'select app.is_mikk_admin() as ok');
    res.json({ rows, bolehKelola: !!hak[0]?.ok });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/client-users — buat akun klien baru
//
// Mengembalikan kata sandi awal SATU KALI. Tidak ada endpoint lain yang
// bisa membacanya kembali.
// ---------------------------------------------------------------------
router.post('/', wajibAdminMikk, async (req, res, next) => {
  const b = req.body || {};
  try {
    const email = String(b.email || '').trim().toLowerCase();
    const nama = String(b.nama || '').trim();
    const peran = b.peran;
    const orgId = b.clientOrgId;

    if (!orgId) return res.status(400).json({ error: 'Organisasi klien wajib dipilih.' });
    if (!nama) return res.status(400).json({ error: 'Nama wajib diisi.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (!PERAN.includes(peran)) return res.status(400).json({ error: 'Peran tidak valid.' });

    // Memastikan organisasinya memang terlihat oleh penanggung jawab ini.
    // RLS pada client_orgs sudah membatasi, tapi tanpa pemeriksaan ini
    // pesan galatnya akan berupa pelanggaran constraint, bukan penjelasan.
    const { rows: org } = await queryAsUser(req.user.id,
      'select id, nama_singkat from client_orgs where id = $1', [orgId]);
    if (!org.length) return res.status(404).json({ error: 'Organisasi klien tidak ditemukan.' });

    const sandi = kataSandiAwal();
    const hash = await hashPassword(sandi);

    const hasil = await withUser(req.user.id, async (client) => {
      // Email yang sudah ada dipakai ulang, bukan ditolak: satu orang bisa
      // sah menjadi anggota lebih dari satu organisasi klien (mis. konsultan
      // yang menangani dua entitas dalam satu grup).
      const { rows: ada } = await client.query(
        'select id, nama, tipe from users where lower(email) = $1', [email]);

      let userId, dibuatBaru = false;
      if (ada.length) {
        if (ada[0].tipe === 'mikk_staff') {
          throw Object.assign(
            new Error('Email ini milik staf MIKK. Gunakan penugasan staf, bukan akun klien.'),
            { status: 409 });
        }
        userId = ada[0].id;
        const { rows: bentrok } = await client.query(
          'select 1 from client_memberships where user_id = $1 and client_org_id = $2',
          [userId, orgId]);
        if (bentrok.length) {
          throw Object.assign(
            new Error('Pengguna ini sudah terdaftar di organisasi tersebut.'), { status: 409 });
        }
      } else {
        const { rows: u } = await client.query(
          `insert into users (email, nama, tipe, no_hp) values ($1,$2,'client_user',$3)
           returning id`, [email, nama, b.noHp || null]);
        userId = u[0].id;
        dibuatBaru = true;
        await client.query(
          'insert into local_auth (user_id, password_hash) values ($1,$2)', [userId, hash]);
      }

      await client.query(
        `insert into client_memberships (user_id, client_org_id, peran) values ($1,$2,$3)`,
        [userId, orgId, peran]);

      return { userId, dibuatBaru };
    });

    res.status(201).json({
      userId: hasil.userId,
      // Kata sandi hanya bermakna untuk akun yang baru dibuat. Pengguna
      // lama tetap memakai kata sandinya sendiri — mengirim balik nilai
      // acak untuknya akan menyesatkan admin.
      kataSandiAwal: hasil.dibuatBaru ? sandi : null,
      pesan: hasil.dibuatBaru ? null : 'Pengguna sudah ada; ditambahkan ke organisasi ini.',
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// PATCH /api/client-users/:membershipId — ubah peran / aktif-nonaktif
// ---------------------------------------------------------------------
router.patch('/:membershipId', wajibAdminMikk, async (req, res, next) => {
  const b = req.body || {};
  try {
    if (b.peran !== undefined && !PERAN.includes(b.peran)) {
      return res.status(400).json({ error: 'Peran tidak valid.' });
    }
    const set = [], val = [req.params.membershipId];
    const taruh = (k, v) => { val.push(v); set.push(`${k} = $${val.length}`); };
    if (Object.prototype.hasOwnProperty.call(b, 'peran')) taruh('peran', b.peran);
    if (Object.prototype.hasOwnProperty.call(b, 'aktif')) taruh('aktif', !!b.aktif);
    if (!set.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });

    const { rows } = await queryAsUser(req.user.id,
      `update client_memberships set ${set.join(', ')} where id = $1 returning id`, val);
    if (!rows.length) return res.status(404).json({ error: 'Keanggotaan tidak ditemukan.' });
    res.json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/client-users/:userId/reset-password
// Menerbitkan kata sandi baru dan mengembalikannya sekali.
// ---------------------------------------------------------------------
router.post('/:userId/reset-password', wajibAdminMikk, async (req, res, next) => {
  try {
    // Hanya boleh untuk pengguna yang memang anggota organisasi yang
    // terlihat oleh admin ini — RLS membatasi baris keanggotaan yang
    // terbaca, jadi pengguna di luar jangkauannya tidak akan ditemukan.
    const { rows: anggota } = await queryAsUser(req.user.id,
      `select u.id, u.tipe from users u
         join client_memberships cm on cm.user_id = u.id
        where u.id = $1 limit 1`, [req.params.userId]);
    if (!anggota.length) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    if (anggota[0].tipe === 'mikk_staff') {
      return res.status(403).json({ error: 'Kata sandi staf MIKK tidak diatur dari sini.' });
    }

    const sandi = kataSandiAwal();
    const hash = await hashPassword(sandi);
    await queryAsUser(req.user.id,
      `insert into local_auth (user_id, password_hash) values ($1,$2)
       on conflict (user_id) do update set password_hash = excluded.password_hash,
                                           updated_at = now()`,
      [req.params.userId, hash]);
    res.json({ kataSandiAwal: sandi });
  } catch (err) { next(err); }
});

module.exports = router;
