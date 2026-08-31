// server/routes/agenda.routes.js
//
// AGENDA — "apa yang akan terjadi", satu daftar berurut waktu.
//
// Dilaporkan langsung oleh pengguna: klien ingin bisa "liat jadwal perkara
// dan perkara yang sedang di jalani" tanpa harus membuka satu per satu modul
// dan membaca kolom tanggal di lima tabel yang berbeda. Endpoint ini
// menyatukan semua yang PUNYA TANGGAL DI DEPAN dari kelima modul jadi satu
// daftar kronologis.
//
// Beda dengan /api/notifications (bel topbar), yang sengaja TIDAK digabung
// ke sini:
//   - bel  = "ada yang salah / hampir telat"  -> hanya yang berstatus
//            kritis/peringatan/kedaluwarsa, horizon pendek (<=7 hari sidang),
//            per-item bisa ditandai sudah dibaca.
//   - agenda = "apa saja yang akan datang"    -> SEMUA yang berjadwal, sehat
//            maupun tidak, horizon panjang (default 90 hari), tidak ada
//            status baca. Sidang yang masih 2 bulan lagi bukan peringatan,
//            tapi tetap perlu terlihat di agenda.
// Keduanya memang bisa memuat baris yang sama pada satu hari tertentu; itu
// disengaja karena perannya beda, bukan duplikasi yang terlewat.
//
// Satu query UNION ALL (bukan lima query paralel seperti di notifications)
// karena di sini hasilnya memang harus DIURUTKAN JADI SATU deret waktu dan
// dipotong N teratas — mengurutkan/memotong di Postgres lebih murah daripada
// menarik lima daftar penuh lalu menggabungnya di Node.
//
// Seperti endpoint lain di proyek ini, penyaringan hak akses dilakukan RLS
// (queryAsUser), bukan oleh WHERE di sini; `client_org_id = $1` cuma memilih
// workspace yang sedang dibuka, bukan pengamanan.

const express = require('express');
const { queryAsUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

const AGENDA_SQL = `
  with rentang as (select current_date as d0, current_date + ($2::int) as d1)
  select * from (
    -- Sidang: dari tabel hearings (jadwal sungguhan, ada jam & agendanya),
    -- bukan kolom ringkasan sidang_terdekat_tanggal di v_cases_display --
    -- satu perkara bisa punya beberapa sidang di depan, dan agenda harus
    -- menampilkan semuanya, bukan yang terdekat saja.
    select 'sidang'::text as jenis, h.tanggal_sidang as tanggal, h.jam_sidang as jam,
           c.nomor_perkara as judul, coalesce(h.agenda, '') as keterangan,
           c.id as entity_id, 'cases'::text as modul
      from hearings h
      join cases c on c.id = h.case_id
     cross join rentang r
     where c.client_org_id = $1
       and h.status in ('terjadwal','ditunda')
       and h.tanggal_sidang between r.d0 and r.d1

    union all
    -- judul = KODE jenisnya (mediasi/negosiasi/...), bukan labelnya:
    -- label yang benar tergantung bahasa yang sedang dipakai dan bisa
    -- diubah admin lewat Master Data, jadi diterjemahkan di sisi klien
    -- (JENIS_PD_NAMA) seperti kode master data lain di aplikasi ini.
    select 'pendampingan', p.tanggal_kegiatan, null::time,
           p.jenis, coalesce(p.lokasi, ''), p.id, 'pendampingan'
      from pendampingan_requests p cross join rentang r
     where p.client_org_id = $1
       and p.status in ('menunggu','diproses')
       and p.tanggal_kegiatan between r.d0 and r.d1

    union all
    select 'kontrak', k.tanggal_berakhir, null::time,
           coalesce(k.judul, k.nomor_dokumen, ''), '', k.id, 'kontrak'
      from v_contracts_display k cross join rentang r
     where k.client_org_id = $1
       and k.tanggal_berakhir between r.d0 and r.d1

    union all
    select 'izin', z.tanggal_kedaluwarsa, null::time,
           z.nama_izin, '', z.id, 'permits'
      from v_permits_display z cross join rentang r
     where z.client_org_id = $1
       and z.tanggal_kedaluwarsa between r.d0 and r.d1

    union all
    select 'proyek', j.target_selesai, null::time,
           j.nama_proyek, '', j.id, 'projects'
      from v_legal_projects_display j cross join rentang r
     where j.client_org_id = $1
       and j.status <> 'selesai'
       and j.target_selesai between r.d0 and r.d1
  ) x
  order by tanggal, jam nulls first
  limit $3`;

// GET /api/agenda?clientOrgId=&hari=90&limit=25
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    // Dibatasi supaya parameter dari URL tidak bisa memaksa query menarik
    // seluruh riwayat (hari) atau seluruh tabel (limit).
    const hari = Math.min(365, Math.max(1, Number(req.query.hari) || 90));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const { rows } = await queryAsUser(req.user.id, AGENDA_SQL, [clientOrgId, hari, limit]);
    res.json({ rows });
  } catch (err) { next(err); }
});

module.exports = router;
