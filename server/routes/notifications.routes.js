// server/routes/notifications.routes.js
//
// Notifikasi bel di topbar. DIHITUNG LANGSUNG dari view yang sama dipakai
// panel "Perlu Perhatian" di Dashboard (v_contracts_display, v_permits_display,
// v_permit_gap, v_cases_display, v_legal_projects_display) -- bukan tabel
// `notifications` terpisah yang perlu diisi cron job. Dashboard cuma
// menampilkan ANGKA ringkasannya; di sini angkanya "dipecah" jadi satu baris
// per item supaya bisa diklik satu-satu dan ditandai dibaca.
//
// Status "sudah dibaca" TIDAK disimpan di server -- endpoint ini selalu
// mengembalikan daftar lengkap yang masih berlaku hari ini, dan sisi klien
// (public/js/app.js) yang menyaring mana yang sudah ditandai dibaca lewat
// localStorage per browser. Konsekuensinya: status baca tidak ikut sinkron
// antar perangkat. Itu trade-off yang disengaja supaya fitur ini tidak perlu
// tabel + endpoint mark-as-read + migrasi baru untuk versi pertama; kalau
// nanti perlu sinkron lintas perangkat, tabel `notifications` yang sudah ada
// di skema (db/01_schema.sql) tinggal dipakai.
//
// id tiap notifikasi stabil (`{jenis}:{id baris}`) SELAMA baris sumbernya
// tidak berubah -- itu yang dipakai localStorage sisi klien sebagai kunci
// "sudah dibaca".

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

function fmtTgl(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// GET /api/notifications?clientOrgId=
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

    const [kontrak, izin, gap, sidang, proyek] = await Promise.all([
      queryAsUser(req.user.id, `
        select id, nomor_dokumen, judul, tanggal_berakhir, status_waktu
          from v_contracts_display
         where client_org_id = $1 and status_waktu in ('kritis','peringatan','kedaluwarsa')
         order by tanggal_berakhir nulls last`, [clientOrgId]),
      queryAsUser(req.user.id, `
        select id, nama_izin, tanggal_kedaluwarsa, status_waktu
          from v_permits_display
         where client_org_id = $1 and status_waktu in ('kritis','peringatan','kedaluwarsa')
         order by tanggal_kedaluwarsa nulls last`, [clientOrgId]),
      queryAsUser(req.user.id, `
        select permit_type_id, nama
          from v_permit_gap
         where client_org_id = $1 and wajib`, [clientOrgId]),
      queryAsUser(req.user.id, `
        select id, nomor_perkara, sidang_terdekat_tanggal, hari_ke_sidang
          from v_cases_display
         where client_org_id = $1 and hari_ke_sidang between 0 and 7`, [clientOrgId]),
      queryAsUser(req.user.id, `
        select id, nama_proyek, target_selesai
          from v_legal_projects_display
         where client_org_id = $1 and status_waktu = 'terlambat'`, [clientOrgId]),
    ]);

    // entityId (beda dari id komposit di atas) -- id baris ASLI-nya, dipakai
    // sisi klien untuk memanggil endpoint /one/:id dan langsung membuka
    // drawer View-nya (bukan cuma pindah modul). permitgap TIDAK punya
    // entityId karena memang belum ada izinnya (belum ada apa pun untuk
    // di-View) -- klik item itu cuma pindah ke modul Perizinan.
    const items = [];
    for (const r of kontrak.rows) {
      const exp = r.status_waktu === 'kedaluwarsa';
      items.push({
        id: `contract:${r.id}`, entityId: r.id, modul: 'kontrak', tingkat: exp ? 'crit' : (r.status_waktu === 'kritis' ? 'crit' : 'warn'),
        judul: r.judul || r.nomor_dokumen || '(tanpa judul)',
        teks: exp ? 'Kontrak sudah kedaluwarsa' : `Kontrak akan berakhir ${fmtTgl(r.tanggal_berakhir)}`,
        tanggal: r.tanggal_berakhir,
      });
    }
    for (const r of izin.rows) {
      const exp = r.status_waktu === 'kedaluwarsa';
      items.push({
        id: `permit:${r.id}`, entityId: r.id, modul: 'permits', tingkat: exp ? 'crit' : (r.status_waktu === 'kritis' ? 'crit' : 'warn'),
        judul: r.nama_izin,
        teks: exp ? 'Izin sudah kedaluwarsa' : `Izin akan berakhir ${fmtTgl(r.tanggal_kedaluwarsa)}`,
        tanggal: r.tanggal_kedaluwarsa,
      });
    }
    for (const r of gap.rows) {
      items.push({
        id: `permitgap:${r.permit_type_id}`, entityId: null, modul: 'permits', tingkat: 'crit',
        judul: r.nama, teks: 'Izin wajib belum dimiliki', tanggal: null,
      });
    }
    for (const r of sidang.rows) {
      items.push({
        id: `case:${r.id}`, entityId: r.id, modul: 'cases', tingkat: r.hari_ke_sidang <= 1 ? 'crit' : 'info',
        judul: r.nomor_perkara,
        teks: r.hari_ke_sidang === 0 ? 'Sidang hari ini' : `Sidang dalam ${r.hari_ke_sidang} hari (${fmtTgl(r.sidang_terdekat_tanggal)})`,
        tanggal: r.sidang_terdekat_tanggal,
      });
    }
    for (const r of proyek.rows) {
      items.push({
        id: `project:${r.id}`, entityId: r.id, modul: 'projects', tingkat: 'warn',
        judul: r.nama_proyek, teks: `Proyek terlambat dari target selesai (${fmtTgl(r.target_selesai)})`, tanggal: r.target_selesai,
      });
    }

    // Kritis dulu, lalu peringatan, lalu info -- dalam satu tingkat, yang
    // tanggalnya paling dekat (mendesak) duluan.
    const bobot = { crit: 0, warn: 1, info: 2 };
    items.sort((a, b) => (bobot[a.tingkat] - bobot[b.tingkat]) || String(a.tanggal || '9999').localeCompare(String(b.tanggal || '9999')));

    res.json({ items });
  } catch (err) { next(err); }
});

module.exports = router;
