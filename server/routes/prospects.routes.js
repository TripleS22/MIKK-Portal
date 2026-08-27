// server/routes/prospects.routes.js
//
// Corong calon klien (Fase 3): pendaftaran, klasifikasi kasus, dan
// pemesanan konsultasi berbayar.
//
// DUA KEPUTUSAN YANG PERLU DIPAHAMI SEBELUM MENGUBAH BERKAS INI:
//
// 1. KODE AKSES BUKAN KREDENSIAL.
//    Calon klien mendapat kode seperti "CLI-4821" untuk menengok kembali
//    permohonannya. Kode itu HANYA pengenal — login tetap meminta kata
//    sandi. Kode berformat tebak-able dijadikan satu-satunya kunci berarti
//    siapa pun yang menebaknya bisa membaca kronologi kasus orang lain,
//    termasuk yang belum tentu jadi klien. Kalau nanti diputuskan login
//    cukup dengan kode, kode itu harus diacak panjang (bukan berurutan)
//    dan sebaiknya dipasangkan OTP.
//
// 2. CONFLICT CHECK ADALAH GERBANG SEBELUM PEMBAYARAN.
//    Endpoint booking menolak melanjutkan bila putusan_benturan belum
//    'aman'. Ini keputusan sadar dari PRD Bagian 2.3: uang calon klien
//    tidak boleh tertahan untuk perkara yang pada akhirnya ditolak firma.

const express = require('express');
const crypto = require('crypto');
const { queryAsUser, withUser, queryAnon } = require('../lib/db');
const { createAuthUser, signInWithPassword } = require('../lib/supabase-auth');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

const KATEGORI = ['pidana', 'perdata', 'litigasi', 'korporasi', 'lainnya'];
const JENIS_MEETING = {
  online:            'konsultasi_online',
  offline_bandung:   'konsultasi_offline',
  offline_luar_kota: 'konsultasi_luar_kota',
};

/* Kode akses acak — dipakai calon klien untuk menemukan kembali
   permohonannya. Diambil dari crypto, bukan berurutan, supaya tidak bisa
   ditebak dari kode milik orang lain. */
function kodeAkses() {
  const n = crypto.randomInt(0, 1e6).toString().padStart(6, '0');
  return `CLI-${n}`;
}

// ---------------------------------------------------------------------
// POST /api/prospects/register — pendaftaran calon klien (langkah 1)
// Tanpa authenticate: orang ini memang belum punya akun.
// ---------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  const b = req.body || {};
  try {
    const email = String(b.email || '').trim().toLowerCase();
    const nama = String(b.nama || '').trim();
    const tipe = b.tipe === 'badan_usaha' ? 'badan_usaha' : 'perorangan';

    if (!email || !nama) return res.status(400).json({ error: 'Nama dan email wajib diisi.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }
    if (!b.password || String(b.password).length < 8) {
      return res.status(400).json({ error: 'Kata sandi minimal 8 karakter.' });
    }

    const { rows: ada } = await queryAnon('select 1 from users where lower(email) = $1', [email]);
    if (ada.length) {
      return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan masuk.' });
    }

    // Akun Supabase Auth dibuat SEBELUM baris users/prospects — kalau
    // langkah ini gagal (mis. email sudah dipakai di sisi Supabase),
    // tidak ada baris yatim yang sempat tersimpan di database aplikasi.
    const akun = await createAuthUser(email, String(b.password));

    // Semua-atau-tidak: user, tautan akun, dan profil calon klien dibuat
    // dalam satu transaksi. Tanpa ini, kegagalan di tengah meninggalkan
    // akun yang bisa login tapi tidak punya profil.
    const hasil = await withUser(null, async (client) => {
      const { rows: u } = await client.query(
        `insert into users (email, nama, tipe, no_hp, auth_user_id) values ($1,$2,'prospect',$3,$4) returning id`,
        [email, nama, b.noHp || null, akun.id]
      );
      const userId = u[0].id;

      // Masalah ayam-telur: kebijakan RLS pada `prospects` mensyaratkan
      // user_id = app.current_user_id(), padahal pendaftar belum punya
      // sesi. Begitu barisnya di users sudah ada, kita jadikan dia
      // identitas transaksi ini — orang ini memang dirinya sendiri.
      // set_config(..., true) berlaku lokal transaksi, jadi tidak bocor
      // ke permintaan lain yang berbagi koneksi dari pool.
      await client.query("select set_config('app.current_user_id', $1, true)", [userId]);

      // Tabrakan kode sangat jarang, tapi bukan mustahil — coba beberapa kali.
      let kode = null;
      for (let i = 0; i < 5 && !kode; i++) {
        const calon = kodeAkses();
        const { rows: bentrok } = await client.query(
          'select 1 from prospects where kode_akses = $1', [calon]
        );
        if (!bentrok.length) kode = calon;
      }
      if (!kode) throw Object.assign(new Error('Gagal membuat kode akses. Coba lagi.'), { status: 503 });

      const { rows: p } = await client.query(
        `insert into prospects
           (user_id, kode_akses, tipe, nama, email, no_hp, kewarganegaraan, alamat, nama_pic, nib)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, kode_akses`,
        [userId, kode, tipe, nama, email, b.noHp || null, b.kewarganegaraan || null,
         b.alamat || null, b.namaPic || null, b.nib || null]
      );
      return { userId, prospect: p[0] };
    });

    // Login langsung setelah daftar — dulu lewat token kustom yang
    // ditandatangani sendiri, sekarang lewat sesi Supabase sungguhan
    // (pola yang sama dengan POST /api/auth/login).
    const sesi = await signInWithPassword(email, String(b.password));
    res.status(201).json({
      token: sesi.accessToken,
      refreshToken: sesi.refreshToken,
      user: { id: hasil.userId, email, nama, tipe: 'prospect' },
      prospect: hasil.prospect,
    });
  } catch (err) { next(err); }
});

// Semua endpoint di bawah butuh sesi.
router.use(authenticate);

// ---------------------------------------------------------------------
// GET /api/prospects/me — profil calon klien yang sedang login
// ---------------------------------------------------------------------
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select id, kode_akses, tipe, nama, email, no_hp, kewarganegaraan, alamat, nama_pic, nib
         from prospects where user_id = $1`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Profil calon klien tidak ditemukan.' });
    res.json({ prospect: rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// GET /api/prospects/rates — daftar tarif konsultasi
// Dibaca dari service_rates, bukan dikode tetap. RLS di 02_rls_dan_views
// mengizinkan SELECT untuk semua yang login; hanya Managing Partner yang
// boleh mengubah.
// ---------------------------------------------------------------------
router.get('/rates', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select id, kode, nama, deskripsi, jenis_layanan, satuan, durasi_menit,
              harga, mata_uang, harga_termasuk_ppn, butuh_penawaran
         from service_rates
        where aktif
          and jenis_layanan in ('konsultasi_online','konsultasi_offline','konsultasi_luar_kota')
          and berlaku_sejak <= current_date
          and (berlaku_sampai is null or berlaku_sampai >= current_date)
        order by urutan, nama`);
    res.json({ rates: rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// GET /api/prospects/consultations — riwayat permohonan milik sendiri
// ---------------------------------------------------------------------
router.get('/consultations', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(req.user.id,
      `select * from v_consultations_display
        where prospect_id = app.my_prospect_id()
        order by created_at desc`);
    res.json({ rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/prospects/consultations — klasifikasi kasus (langkah 2)
// ---------------------------------------------------------------------
router.post('/consultations', async (req, res, next) => {
  const b = req.body || {};
  try {
    if (!KATEGORI.includes(b.kategoriLayanan)) {
      return res.status(400).json({ error: 'Kategori layanan tidak valid.' });
    }
    const kronologi = String(b.kronologi || '').trim();
    if (kronologi.length < 20) {
      return res.status(400).json({ error: 'Kronologi kasus wajib diisi, minimal 20 karakter.' });
    }

    const hasil = await withUser(req.user.id, async (client) => {
      const { rows: p } = await client.query(
        'select id from prospects where user_id = $1', [req.user.id]);
      if (!p.length) throw Object.assign(new Error('Profil calon klien tidak ditemukan.'), { status: 404 });

      const { rows: n } = await client.query('select app.nomor_konsultasi_berikutnya() as nomor');
      const { rows } = await client.query(
        `insert into consultations
           (prospect_id, nomor, kategori_layanan, kronologi, target_hukum, lawan_pihak_nama, status)
         values ($1,$2,$3,$4,$5,$6,'menunggu_tinjauan')
         returning id, nomor`,
        [p[0].id, n[0].nomor, b.kategoriLayanan, kronologi,
         b.targetHukum || null, b.lawanPihakNama || null]
      );
      return rows[0];
    });

    // Conflict check dijalankan segera, bukan ditunda — supaya calon klien
    // tahu sebelum melihat harga apakah perkaranya bisa ditangani.
    if (b.lawanPihakNama) await jalankanCekBenturan(req.user.id, hasil.id, b.lawanPihakNama);

    const { rows } = await queryAsUser(req.user.id,
      'select * from v_consultations_display where id = $1', [hasil.id]);
    res.status(201).json({ consultation: rows[0] });
  } catch (err) { next(err); }
});

/* Menjalankan app.cek_benturan lalu menyimpan putusannya di konsultasi.
   Fungsi itu security definer: mencocokkan ke SELURUH registri lawan
   pihak tapi hanya mengembalikan putusan — calon klien tidak pernah bisa
   menyimpulkan siapa saja klien firma dari sini. */
async function jalankanCekBenturan(userId, consultationId, nama) {
  return withUser(userId, async (client) => {
    const { rows } = await client.query(
      'select putusan, alasan from app.cek_benturan($1, null)', [nama]);
    const putusan = rows[0]?.putusan || 'belum_diperiksa';
    const alasan = rows[0]?.alasan || null;
    // 'terbentur' menutup permohonan; 'perlu_ditinjau' menunggu Managing
    // Partner. Sistem tidak pernah memutuskan sendiri untuk menolak klien
    // — ia hanya menandai (PRD Bagian 7.3).
    const status = putusan === 'terbentur' ? 'ditolak' : 'menunggu_tinjauan';
    await client.query(
      `update consultations
          set putusan_benturan = $2, alasan_benturan = $3, status = $4
        where id = $1`,
      [consultationId, putusan, alasan, status]
    );
    return { putusan, alasan };
  });
}

// ---------------------------------------------------------------------
// POST /api/prospects/consultations/:id/booking — jadwal & harga (langkah 3)
//
// Di sinilah gerbang benturan kepentingan ditegakkan.
// ---------------------------------------------------------------------
router.post('/consultations/:id/booking', async (req, res, next) => {
  const b = req.body || {};
  try {
    const jenis = b.jenisMeeting;
    if (!JENIS_MEETING[jenis]) {
      return res.status(400).json({ error: 'Jenis pertemuan tidak valid.' });
    }

    const hasil = await withUser(req.user.id, async (client) => {
      // RLS sudah membatasi baris yang terlihat; ini memastikan barisnya ada.
      const { rows: c } = await client.query(
        'select id, putusan_benturan, status from consultations where id = $1', [req.params.id]);
      if (!c.length) throw Object.assign(new Error('Permohonan tidak ditemukan.'), { status: 404 });

      if (c[0].putusan_benturan !== 'aman') {
        const pesan = c[0].putusan_benturan === 'terbentur'
          ? 'Permohonan ini tidak dapat dilanjutkan karena terdapat benturan kepentingan.'
          : 'Permohonan Anda sedang ditinjau tim MIKK. Pembayaran dibuka setelah peninjauan selesai.';
        throw Object.assign(new Error(pesan), { status: 409 });
      }

      // Harga diambil dari service_rates, lalu DIBEKUKAN ke baris booking.
      const { rows: r } = await client.query(
        `select id, harga, durasi_menit, butuh_penawaran from service_rates
          where jenis_layanan = $1 and aktif
            and berlaku_sejak <= current_date
            and (berlaku_sampai is null or berlaku_sampai >= current_date)
          order by urutan limit 1`,
        [JENIS_MEETING[jenis]]
      );
      if (!r.length) throw Object.assign(new Error('Tarif untuk jenis ini belum ditetapkan.'), { status: 503 });
      const tarif = r[0];

      let diskon = 0, kuponId = null;
      if (b.kodeKupon && !tarif.butuh_penawaran) {
        const { rows: k } = await client.query(
          'select * from app.tukar_kupon($1,$2,$3)',
          [b.kodeKupon, JENIS_MEETING[jenis], tarif.harga]
        );
        if (!k[0]?.valid) {
          throw Object.assign(new Error(k[0]?.alasan || 'Kode kupon tidak berlaku.'), { status: 400 });
        }
        diskon = Number(k[0].diskon) || 0;
        kuponId = k[0].kupon_id;
      }

      const total = tarif.butuh_penawaran ? null : Math.max(0, Number(tarif.harga) - diskon);

      const { rows: bk } = await client.query(
        `insert into consultation_bookings
           (consultation_id, service_rate_id, jenis_meeting, tanggal, jam_mulai, durasi_menit,
            lokasi, harga_satuan, diskon, total, butuh_penawaran, kupon_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [req.params.id, tarif.id, jenis, b.tanggal || null, b.jamMulai || null,
         tarif.durasi_menit, b.lokasi || null,
         tarif.butuh_penawaran ? null : tarif.harga,
         tarif.butuh_penawaran ? 0 : diskon,
         total, tarif.butuh_penawaran, kuponId]
      );

      if (kuponId) {
        await client.query('update coupons set terpakai = terpakai + 1 where id = $1', [kuponId]);
      }
      return bk[0];
    });

    const { rows } = await queryAsUser(req.user.id,
      'select * from v_consultations_display where id = $1', [req.params.id]);
    res.status(201).json({ bookingId: hasil.id, consultation: rows[0] });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// POST /api/prospects/coupons/preview — hitung diskon tanpa memesan
// Dipakai tombol "Terapkan" di formulir, supaya calon klien melihat
// potongannya sebelum menekan lanjut.
// ---------------------------------------------------------------------
router.post('/coupons/preview', async (req, res, next) => {
  const b = req.body || {};
  try {
    const jenis = JENIS_MEETING[b.jenisMeeting];
    if (!jenis) return res.status(400).json({ error: 'Jenis pertemuan tidak valid.' });

    const { rows: r } = await queryAsUser(req.user.id,
      `select harga, butuh_penawaran from service_rates
        where jenis_layanan = $1 and aktif order by urutan limit 1`, [jenis]);
    if (!r.length) return res.status(503).json({ error: 'Tarif belum ditetapkan.' });
    if (r[0].butuh_penawaran) {
      return res.status(400).json({ error: 'Konsultasi luar kota memakai penawaran, bukan kupon.' });
    }

    const { rows } = await queryAsUser(req.user.id,
      'select * from app.tukar_kupon($1,$2,$3)', [b.kode || '', jenis, r[0].harga]);
    const k = rows[0] || {};
    res.json({
      valid: !!k.valid, alasan: k.alasan,
      subtotal: Number(r[0].harga), diskon: Number(k.diskon) || 0,
      total: Math.max(0, Number(r[0].harga) - (Number(k.diskon) || 0)),
    });
  } catch (err) { next(err); }
});

module.exports = router;
