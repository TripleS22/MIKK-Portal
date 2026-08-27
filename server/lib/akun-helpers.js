// server/lib/akun-helpers.js
//
// Dipakai bersama oleh server/routes/client-users.routes.js (akun customer)
// DAN server/routes/staff-users.routes.js (akun admin MIKK / PIC & legal) —
// dipisah ke sini supaya kata sandi awal & gerbang "admin-only" konsisten
// di kedua alur, bukan disalin-tempel dan diam-diam berbeda seiring waktu.

const crypto = require('crypto');
const { queryAsUser } = require('./db');

/* Kata sandi awal dibuat sistem, bukan diketik admin. Admin yang mengetik
   sendiri cenderung memilih pola yang mudah ditebak dan memakainya ulang
   untuk banyak akun. Nilai ini ditampilkan SEKALI ke admin (dan, untuk
   akun customer, dikirim sekali ke email orangnya — lihat server/lib/
   email.js) lalu tidak pernah bisa dibaca lagi — yang tersimpan hanya di
   Supabase Auth, bukan di database aplikasi ini. */
function kataSandiAwal() {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const acak = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 14; i++) s += abjad[acak[i] % abjad.length];
  return s;
}

/* Hanya Managing Partner & Admin Staf boleh melakukan tindakan admin-only
   — dipakai bukan cuma untuk akun (client-users/staff-users.routes.js),
   tapi juga layar admin lain yang butuh gerbang serupa (mis.
   permit-types.routes.js). Sama dengan batas yang sudah ditegakkan RLS
   pada tabel terkait, disebutkan lagi di sini agar penolakannya
   berpesan jelas SEBELUM sempat menyentuh database — dan karena tabel
   `users` sendiri tidak punya RLS (lihat peringatan di
   client-users.routes.js), jadi untuk endpoint akun ini SATU-SATUNYA
   penjaga. Pesannya sengaja generik ("melakukan tindakan ini"), bukan
   spesifik "mengelola akun", karena dipakai lintas beberapa jenis
   tindakan berbeda. */
async function wajibAdminMikk(req, res, next) {
  try {
    const { rows } = await queryAsUser(req.user.id, 'select app.is_mikk_admin() as ok');
    if (!rows[0]?.ok) {
      return res.status(403).json({
        error: 'Hanya Managing Partner atau Admin Staf yang dapat melakukan tindakan ini.',
      });
    }
    next();
  } catch (err) { next(err); }
}

module.exports = { kataSandiAwal, wajibAdminMikk };
