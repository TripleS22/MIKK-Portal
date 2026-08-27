// server/routes/contracts.routes.js
//
// Semua query di sini berjalan lewat withUser()/queryAsUser(), yang
// mengeset app.current_user_id sebelum menyentuh tabel. Isolasi antar
// klien ditegakkan oleh kebijakan RLS di 02_rls_dan_views.sql — endpoint
// ini TIDAK menambahkan pemeriksaan "apakah klien ini miliknya" secara
// manual, karena menduplikasi logika itu di dua tempat adalah sumber bug
// yang paling umum (satu tempat diperbarui, satu lupa).

const express = require('express');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');
const { opsiKategori } = require('../lib/opsi-master');

const router = express.Router();
router.use(authenticate);

const SORT_MAP = {
  mulai: 'v.tanggal_mulai',
  akhir: 'v.tanggal_berakhir',
  sisa: 'v.sisa_hari',
  skor: 'v.skor_kelengkapan',
  judul: 'v.judul',
};

// GET /api/contracts?clientOrgId=&q=&kategori=&status=&lengkap=&sort=&dir=&page=&per=
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId, q, kategori, status, lengkap } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

    const sortCol = SORT_MAP[req.query.sort] || 'v.skor_kelengkapan';
    const dir = req.query.dir === 'desc' ? 'desc' : 'asc';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const per = Math.min(100, Math.max(1, parseInt(req.query.per, 10) || 15));
    const offset = (page - 1) * per;

    const where = ['v.client_org_id = $1'];
    const params = [clientOrgId];
    let i = params.length;

    if (q) {
      i += 1; params.push(`%${q}%`);
      where.push(`(v.judul ilike $${i} or coalesce(v.nomor_dokumen,'') ilike $${i})`);
    }
    if (kategori) { i += 1; params.push(kategori); where.push(`v.kategori_nama = $${i}`); }
    if (status)   { i += 1; params.push(status);   where.push(`v.status_waktu = $${i}`); }
    if (lengkap === 'belum') where.push('v.skor_kelengkapan < 1');
    if (lengkap === 'sudah') where.push('v.skor_kelengkapan = 1');

    const whereSql = where.join(' and ');

    const { rows: countRows } = await queryAsUser(
      req.user.id,
      `select count(*)::int as n from v_contracts_display v where ${whereSql}`,
      params
    );
    const total = countRows[0]?.n || 0;

    i += 1; const limitIdx = i; params.push(per);
    i += 1; const offsetIdx = i; params.push(offset);

    const { rows } = await queryAsUser(
      req.user.id,
      `select v.id, v.nomor_dokumen, v.judul, v.kategori_id, v.kategori_nama, v.jenis_dokumen,
              v.lawan_pihak, v.counterparty_id, v.tanggal_mulai, v.tanggal_berakhir,
              v.tanpa_batas_waktu, v.nilai_kontrak, v.nilai_tidak_relevan,
              v.status_siklus, v.parent_contract_id, v.relasi_ke_induk,
              v.pic_legal_id, v.keterangan, v.catatan_migrasi,
              v.sisa_hari, v.sudah_digantikan, v.status_waktu, v.skor_kelengkapan
         from v_contracts_display v
        where ${whereSql}
        order by ${sortCol} ${dir}, v.judul asc
        limit $${limitIdx} offset $${offsetIdx}`,
      params
    );

    res.json({ rows, total, page, per });
  } catch (err) { next(err); }
});

// GET /api/contracts/one/:id — satu kontrak lengkap, dipakai drawer & peta kelengkapan.
router.get('/one/:id', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select v.id, v.nomor_dokumen, v.judul, v.kategori_id, v.kategori_nama, v.jenis_dokumen,
              v.lawan_pihak, v.counterparty_id, v.tanggal_mulai, v.tanggal_berakhir,
              v.tanpa_batas_waktu, v.nilai_kontrak, v.nilai_tidak_relevan,
              v.status_siklus, v.parent_contract_id, v.relasi_ke_induk,
              v.pic_legal_id, v.keterangan, v.catatan_migrasi,
              v.sisa_hari, v.sudah_digantikan, v.status_waktu, v.skor_kelengkapan
         from v_contracts_display v where v.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Kontrak tidak ditemukan, atau Anda tidak punya akses.' });
    res.json({ row: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/contracts/dashboard?clientOrgId=
router.get('/dashboard', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select * from v_dashboard_kontrak where client_org_id = $1`,
      [clientOrgId]
    );
    res.json({
      dashboard: rows[0] || {
        client_org_id: clientOrgId, total_kontrak: 0, kontrak_aktif: 0,
        akan_berakhir_90h: 0, kedaluwarsa: 0, sudah_diperpanjang: 0,
        total_nilai: 0, jumlah_bernilai: 0, kelengkapan_persen: 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/contracts/ledger?clientOrgId=  — data ringkas untuk peta kelengkapan
router.get('/ledger', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
    const { rows } = await queryAsUser(
      req.user.id,
      `select id, judul,
              (nomor_dokumen is not null)::int as f_nomor,
              (counterparty_id is not null)::int as f_lawan,
              (tanggal_mulai is not null)::int as f_mulai,
              ((tanggal_berakhir is not null) or tanpa_batas_waktu)::int as f_akhir,
              ((nilai_kontrak is not null) or nilai_tidak_relevan)::int as f_nilai
         from contracts
        where client_org_id = $1 and status_siklus <> 'dibatalkan'
        order by created_at`,
      [clientOrgId]
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /api/contracts/reference?clientOrgId=  — kategori, PIC, daftar induk yang bisa dipilih
router.get('/reference', async (req, res, next) => {
  try {
    const { clientOrgId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

    const [kategori, pic, induk, lawan, jenisDokumen, statusSiklus, relasi] = await Promise.all([
      queryAsUser(req.user.id,
        `select id, nama from contract_categories where client_org_id=$1 and aktif order by urutan`,
        [clientOrgId]),
      queryAsUser(req.user.id,
        // 'supervisi' dikecualikan — peran pengawasan, bukan penanggung
        // jawab kontrak (sama seperti permits.routes.js /reference).
        `select distinct u.id, u.nama, ms.jabatan
           from users u
           join client_assignments ca on ca.user_id = u.id
           left join mikk_staff ms on ms.user_id = u.id
          where ca.client_org_id = $1 and ca.peran in ('pic_utama','pendukung')
            and (ca.selesai is null or ca.selesai >= current_date)
          order by u.nama`,
        [clientOrgId]),
      queryAsUser(req.user.id,
        `select id, nomor_dokumen, judul from contracts where client_org_id=$1 order by judul`,
        [clientOrgId]),
      queryAsUser(req.user.id,
        `select id, nama_legal, is_client from counterparties order by nama_legal`),
      opsiKategori(queryAsUser, req.user.id, 'contracts_jenis_dokumen'),
      opsiKategori(queryAsUser, req.user.id, 'contracts_status_siklus'),
      opsiKategori(queryAsUser, req.user.id, 'contracts_relasi_ke_induk'),
    ]);

    res.json({
      kategori: kategori.rows,
      pic: pic.rows,
      induk: induk.rows,
      lawanPihak: lawan.rows,
      jenisDokumen, statusSiklus, relasi,
    });
  } catch (err) { next(err); }
});

// POST /api/contracts
router.post('/', async (req, res, next) => {
  const b = req.body || {};
  if (!b.clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });
  if (!b.judul || !b.judul.trim()) return res.status(400).json({ error: 'Judul kontrak wajib diisi.' });

  try {
    const result = await withUser(req.user.id, async (client) => {
      const lawanPihakId = await resolveCounterparty(client, b);
      const { rows } = await client.query(
        `insert into contracts
           (client_org_id, nomor_dokumen, judul, counterparty_id, kategori_id, jenis_dokumen,
            tanggal_mulai, tanggal_berakhir, tanpa_batas_waktu, nilai_kontrak, nilai_tidak_relevan,
            status_siklus, parent_contract_id, relasi_ke_induk, auto_renew, notice_period_hari,
            pic_legal_id, keterangan, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         returning id`,
        [
          b.clientOrgId, b.nomor || null, b.judul.trim(), lawanPihakId,
          b.kategoriId || null, b.jenis || null, b.mulai || null, b.akhir || null,
          !!b.tanpaBatas, b.nilai ?? null, !!b.nilaiTidakRelevan,
          b.status || 'draf', b.indukId || null, b.relasi || null,
          !!b.autoRenew, b.notice ?? null, b.picLegalId || null, b.keterangan || null,
          req.user.id,
        ]
      );
      return rows[0];
    });
    res.status(201).json({ id: result.id });
  } catch (err) { next(mapPgError(err)); }
});

// Menerima lawanPihakNama (teks bebas dari input+datalist di frontend) ATAU
// lawanPihakId (bila field tidak diubah dari nilai yang sudah tersimpan).
// Resolusi nama->id lewat app.resolusi_lawan_pihak(), yang berjalan sebagai
// SECURITY DEFINER supaya bisa mencocokkan ke entitas klien MIKK yang tidak
// boleh dijelajahi bebas oleh pengguna klien lain, tanpa membocorkan detailnya.
async function resolveCounterparty(client, b) {
  if (b.lawanPihakNama && b.lawanPihakNama.trim()) {
    const { rows } = await client.query(`select app.resolusi_lawan_pihak($1) as id`, [b.lawanPihakNama.trim()]);
    return rows[0].id;
  }
  return b.lawanPihakId || null;
}

// PATCH /api/contracts/:id
router.patch('/:id', async (req, res, next) => {
  const b = req.body || {};
  try {
    const result = await withUser(req.user.id, async (client) => {
      const lawanPihakId = (b.lawanPihakNama !== undefined || b.lawanPihakId !== undefined)
        ? await resolveCounterparty(client, b)
        : undefined;

      const allowed = {
        nomor_dokumen: b.nomor, judul: b.judul, counterparty_id: lawanPihakId,
        kategori_id: b.kategoriId, jenis_dokumen: b.jenis, tanggal_mulai: b.mulai,
        tanggal_berakhir: b.tanpaBatas ? null : b.akhir, tanpa_batas_waktu: b.tanpaBatas,
        nilai_kontrak: b.nilaiTidakRelevan ? null : (b.nilai ?? null),
        nilai_tidak_relevan: b.nilaiTidakRelevan, status_siklus: b.status,
        parent_contract_id: b.indukId || null, relasi_ke_induk: b.relasi || null,
        auto_renew: b.autoRenew, notice_period_hari: b.notice ?? null,
        pic_legal_id: b.picLegalId || null, keterangan: b.keterangan || null,
      };
      const cols = Object.keys(allowed).filter((k) => allowed[k] !== undefined);
      if (!cols.length) throw httpError(400, 'Tidak ada kolom yang diperbarui.');

      const setSql = cols.map((c, idx) => `${c} = $${idx + 2}`).join(', ');
      const values = cols.map((c) => allowed[c]);
      const { rows } = await client.query(
        `update contracts set ${setSql} where id = $1 returning id`,
        [req.params.id, ...values]
      );
      if (!rows.length) throw httpError(404, 'Kontrak tidak ditemukan, atau Anda tidak punya akses.');
      return rows[0];
    });
    res.json({ id: result.id });
  } catch (err) { next(mapPgError(err)); }
});

// Menerjemahkan pesan constraint Postgres (Bahasa Inggris teknis) menjadi
// pesan yang bisa langsung ditampilkan ke PIC di formulir.
function mapPgError(err) {
  if (err.code === '23505') {
    if (err.constraint === 'contracts_nomor_unik') {
      return httpError(409, 'Nomor dokumen ini sudah dipakai kontrak lain di klien yang sama.');
    }
  }
  if (err.code === '23514') {
    const m = {
      contracts_tgl_masuk_akal: 'Tanggal berakhir tidak boleh mendahului tanggal mulai.',
      contracts_induk_wajib_relasi: 'Pilih kontrak induk lebih dulu, atau kosongkan relasinya.',
      contracts_bukan_induk_sendiri: 'Kontrak tidak boleh menjadi induk bagi dirinya sendiri.',
      contracts_tanpa_batas_konsisten: 'Kontrak ditandai tanpa batas waktu, jadi tanggal berakhir harus kosong.',
      contracts_nilai_konsisten: 'Kontrak ditandai tidak bernilai rupiah, jadi kolom nilai harus kosong.',
    };
    return httpError(422, m[err.constraint] || 'Data tidak memenuhi aturan validasi.');
  }
  if (err.code === '42501') {
    return httpError(403, 'Anda tidak memiliki akses untuk mengubah data ini.');
  }
  return err;
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = router;
