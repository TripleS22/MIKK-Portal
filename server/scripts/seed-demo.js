// server/scripts/seed-demo.js
//
// Seeder DEMO — satu klien retainer fiktif (nama, NPWP/NIB, alamat semua
// karangan, BUKAN data perusahaan sungguhan) diisi PENUH di semua modul
// sekaligus, termasuk berkas sungguhan (bukan baris `documents` dengan
// storage_path yang menunjuk ke berkas yang tidak pernah ada) — supaya
// ada satu klien contoh yang datanya lengkap dari Dashboard, Kontrak,
// Perizinan, Litigasi, Proyek Legal, Hub Pendampingan, sampai Arsip
// Dokumen, buat demo/uji coba tampilan tanpa harus mengisi manual.
//
// BEDA dari db/03_seed_nhc.sql: itu bagian dari migrate.js (dijalankan
// SEKALI di database kosong, urutan ORDER tetap). Skrip ini berdiri
// sendiri (`node server/scripts/seed-demo.js`), aman dijalankan ulang —
// kalau organisasi dengan nama_singkat ini SUDAH ada, skrip berhenti
// tanpa mengubah apa pun (bukan menduplikasi).
//
// Dokumennya diunggah ke Supabase Storage (BUKAN disk lokal) — sama
// dengan yang dipakai deployment Cloudflare Workers — supaya berkasnya
// langsung bisa dilihat/preview dari aplikasi live, bukan cuma lokal.

require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');
const { initSupabaseStorage, putFile } = require('../lib/storage');
const { createAuthUser } = require('../lib/supabase-auth');

const NAMA_SINGKAT = 'KAL';
const DEMO_PASSWORD = 'MikkDemo!2026';

// Staf MIKK yang SUDAH ada (dibuat db/03_seed_nhc.sql) — dipakai ulang
// sebagai PIC, bukan dibuat staf baru.
const IRFAN = '4967ac24-780b-4bea-a11a-159c6a238560'; // managing_partner
const AGENG = '695999db-ee5c-4161-ac57-7acc8cf8c3f7'; // senior_associate
const PUTRI = '5c618da2-146b-4d67-8990-48d907ef5fb1'; // associate

// ---------------------------------------------------------------------
// Berkas contoh — dibuat sungguhan (bukan sekadar baris database), isi
// karangan/placeholder, secukupnya untuk membuktikan unggah+preview
// jalan. minimalPdf() menghasilkan PDF satu halaman VALID (dites bisa
// dibuka), bukan sekadar berkas .pdf yang isinya teks biasa.
// ---------------------------------------------------------------------
// Font standar (Helvetica) di PDF minimal begini cuma aman untuk WinAnsi/
// Latin-1 dasar — karakter di luar itu (mis. em dash "—") tampil sebagai
// celah kosong, bukan galat, tapi tetap salah tampil. Diratakan ke ASCII
// polos dulu di sini SEKALI (bukan mengingat-ingat di tiap teks yang
// dikirim ke fungsi ini) supaya tidak terulang kalau kontennya nanti nambah.
function toLatin1Aman(s) {
  return String(s)
    .replace(/[–—]/g, '-')   // en dash, em dash
    .replace(/[‘’]/g, "'")   // tanda kutip miring tunggal
    .replace(/[“”]/g, '"');  // tanda kutip miring ganda
}

function minimalPdf(judul, baris) {
  const semuaBaris = [judul, '', ...baris].map(toLatin1Aman);
  const isiTeks = semuaBaris.map((b, i) => `BT /F1 12 Tf 50 ${740 - i * 18} Td (${
    b.replace(/[()\\]/g, (c) => '\\' + c)
  }) Tj ET`).join('\n');
  const stream = `${isiTeks}`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function teks(isi) {
  return Buffer.from(isi, 'utf8');
}

async function unggahDokumen(client, { pemilikId, entityType, entityId, namaFile, mime, buffer, uploadedBy }) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storedName = `${crypto.randomUUID()}${namaFile.includes('.') ? '.' + namaFile.split('.').pop() : ''}`;
  const storagePath = `${pemilikId}/${storedName}`;
  const { rows } = await client.query(
    `insert into documents (client_org_id, storage_path, nama_file, mime_type, ukuran_byte, sha256,
                             kategori_arsip, tahun_arsip, rahasia, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) returning id`,
    [pemilikId, storagePath, namaFile, mime, buffer.length, sha256, 'seed_demo', new Date().getFullYear(), uploadedBy]
  );
  if (entityType && entityId) {
    await client.query(
      `insert into document_links (document_id, entity_type, entity_id) values ($1,$2,$3) on conflict do nothing`,
      [rows[0].id, entityType, entityId]
    );
  }
  await putFile(storagePath, buffer);
  return rows[0].id;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  initSupabaseStorage(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, 'mikk-documents');

  const client = await pool.connect();
  try {
    const { rows: ada } = await client.query('select id from client_orgs where nama_singkat = $1', [NAMA_SINGKAT]);
    if (ada.length) {
      console.log(`Organisasi "${NAMA_SINGKAT}" sudah ada (id ${ada[0].id}) — dilewati, tidak menduplikasi.`);
      console.log('Hapus dulu manual kalau mau seed ulang dari nol.');
      return;
    }

    await client.query('BEGIN');
    await client.query("select set_config('app.current_user_id', $1, true)", [IRFAN]);

    // ---------------- client_orgs ----------------
    const { rows: orgRows } = await client.query(
      `insert into client_orgs
         (nama_legal, nama_singkat, npwp, nib, kbli, sektor_usaha, alamat, status_retainer, retainer_mulai)
       values ($1,$2,$3,$4,$5,$6,$7,'aktif', current_date - interval '8 months')
       returning id`,
      [
        'PT Kirana Angkasa Logistik', NAMA_SINGKAT,
        '02.345.678.9-012.000', '9120001234567',
        ['49431', '52101', '51100'],
        'Logistik & Kargo Udara',
        'Jl. Marunda Center Blok C No. 12, Cilincing, Jakarta Utara 14150',
      ]
    );
    const orgId = orgRows[0].id;
    console.log(`Organisasi dibuat: PT Kirana Angkasa Logistik (${NAMA_SINGKAT}) — id ${orgId}`);

    // ---------------- client_assignments (PIC MIKK) ----------------
    await client.query(
      `insert into client_assignments (client_org_id, user_id, peran) values
         ($1,$2,'pic_utama'), ($1,$3,'pendukung'), ($1,$4,'supervisi')`,
      [orgId, IRFAN, AGENG, PUTRI]
    );

    // ---------------- field kustom profil ----------------
    await client.query(
      `insert into client_org_custom_fields (client_org_id, label, nilai, urutan) values
         ($1,'Nomor Akta Pendirian','17, Notaris Rangga Wijaya S.H., M.Kn., 3 Februari 2019',0),
         ($1,'Kontak Person','Dewi Anggraini — Manajer Legal & Perizinan',1),
         ($1,'Bank Operasional','Bank Mandiri Cabang Tanjung Priok — 123-00-4567890-1',2)`,
      [orgId]
    );

    // ---------------- contract_categories ----------------
    const { rows: kat } = await client.query(
      `insert into contract_categories (client_org_id, nama, urutan) values
         ($1,'Kerja Sama Operasional',0), ($1,'Sewa Gudang & Fasilitas',1), ($1,'Vendor & Pengadaan',2)
       returning id, nama`,
      [orgId]
    );
    const katId = Object.fromEntries(kat.map((k) => [k.nama, k.id]));

    // ---------------- counterparties ----------------
    const { rows: lawan } = await client.query(
      `insert into counterparties (nama_legal, nama_alias, jenis, is_client, catatan, created_by) values
         ('PT Cipta Kargo Ekspres', array['Cipta Kargo'], 'pt', false, 'Mitra pengangkutan darat', $1),
         ('PT Gudang Sejahtera Abadi', array['GSA'], 'pt', false, 'Pemilik gudang Marunda', $1),
         ('CV Sumber Palet Nusantara', array['Sumber Palet'], 'cv', false, 'Vendor palet & kemasan', $1),
         ('PT Aviasi Cargo Indonesia', array['Aviasi Cargo'], 'pt', false, 'Mitra kargo udara', $1)
       returning id, nama_legal`,
      [IRFAN]
    );
    const cp = Object.fromEntries(lawan.map((l) => [l.nama_legal, l.id]));

    // Baris demi baris (BUKAN satu INSERT ber-banyak-baris dengan $1..$N
    // dibagi rata) — dicoba dulu gaya multi-row, hasilnya JUSTRU salah
    // pasang (satu percobaan nyata: pic_id kebagian id kategori kontrak)
    // karena nomor placeholder yang dipakai ulang lintas baris gampang
    // salah hitung dengan tangan begitu barisnya lebih dari 3-4. Sengaja
    // ditukar ke pola ini SETELAH itu, bukan gaya awal.
    async function baris(table, kolom, nilaiPerBaris, extraReturning) {
      const hasil = [];
      for (const v of nilaiPerBaris) {
        const ph = kolom.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await client.query(
          `insert into ${table} (${kolom.join(',')}) values (${ph}) returning id${extraReturning ? ', ' + extraReturning : ''}`,
          kolom.map((k) => v[k])
        );
        hasil.push(rows[0]);
      }
      return hasil;
    }

    // ---------------- contracts ----------------
    const kontrakKolom = ['client_org_id', 'nomor_dokumen', 'judul', 'counterparty_id', 'kategori_id',
      'jenis_dokumen', 'tanggal_mulai', 'tanggal_berakhir', 'nilai_kontrak', 'status_siklus', 'pic_legal_id', 'created_by'];
    const kontrakRows = await baris('contracts', kontrakKolom, [
      { client_org_id: orgId, nomor_dokumen: '001/KAL-CKE/I/2025', judul: 'PKS Pengangkutan Darat Rute Jabodetabek',
        counterparty_id: cp['PT Cipta Kargo Ekspres'], kategori_id: katId['Kerja Sama Operasional'], jenis_dokumen: 'PKS',
        tanggal_mulai: '2025-01-15', tanggal_berakhir: '2027-01-14', nilai_kontrak: 2500000000, status_siklus: 'aktif', pic_legal_id: IRFAN, created_by: IRFAN },
      { client_org_id: orgId, nomor_dokumen: '002/KAL-GSA/II/2025', judul: 'Sewa Gudang Marunda 2.400 m²',
        counterparty_id: cp['PT Gudang Sejahtera Abadi'], kategori_id: katId['Sewa Gudang & Fasilitas'], jenis_dokumen: 'Perjanjian Sewa',
        tanggal_mulai: '2025-02-01', tanggal_berakhir: '2028-01-31', nilai_kontrak: 1800000000, status_siklus: 'aktif', pic_legal_id: IRFAN, created_by: IRFAN },
      { client_org_id: orgId, nomor_dokumen: '003/KAL-SPN/III/2025', judul: 'Pengadaan Palet Kayu & Plastik',
        counterparty_id: cp['CV Sumber Palet Nusantara'], kategori_id: katId['Vendor & Pengadaan'], jenis_dokumen: 'PO Tahunan',
        tanggal_mulai: '2025-03-01', tanggal_berakhir: '2026-02-28', nilai_kontrak: 450000000, status_siklus: 'aktif', pic_legal_id: AGENG, created_by: AGENG },
      { client_org_id: orgId, nomor_dokumen: '004/KAL-ACI/V/2025', judul: 'Kerja Sama Kargo Udara Domestik',
        counterparty_id: cp['PT Aviasi Cargo Indonesia'], kategori_id: katId['Kerja Sama Operasional'], jenis_dokumen: 'PKS',
        tanggal_mulai: '2025-05-10', tanggal_berakhir: '2026-05-09', nilai_kontrak: 3200000000, status_siklus: 'dalam_review', pic_legal_id: IRFAN, created_by: IRFAN },
      { client_org_id: orgId, nomor_dokumen: null, judul: 'Perpanjangan Sewa Gudang Cikarang',
        counterparty_id: null, kategori_id: katId['Sewa Gudang & Fasilitas'], jenis_dokumen: 'Perjanjian Sewa',
        tanggal_mulai: null, tanggal_berakhir: null, nilai_kontrak: null, status_siklus: 'draf', pic_legal_id: AGENG, created_by: AGENG },
      { client_org_id: orgId, nomor_dokumen: '005/KAL-INT/VI/2024', judul: 'PKS Sistem Pelacakan Armada (Fleet Tracking)',
        counterparty_id: null, kategori_id: katId['Vendor & Pengadaan'], jenis_dokumen: 'PKS',
        tanggal_mulai: '2024-06-01', tanggal_berakhir: '2025-05-31', nilai_kontrak: 680000000, status_siklus: 'selesai', pic_legal_id: IRFAN, created_by: IRFAN },
      { client_org_id: orgId, nomor_dokumen: '006/KAL-CKE/VII/2025', judul: 'Addendum Penambahan Rute Bandung',
        counterparty_id: cp['PT Cipta Kargo Ekspres'], kategori_id: katId['Kerja Sama Operasional'], jenis_dokumen: 'Addendum',
        tanggal_mulai: '2025-07-01', tanggal_berakhir: null, nilai_kontrak: null, status_siklus: 'aktif', pic_legal_id: IRFAN, created_by: IRFAN },
    ]);
    console.log(`  ${kontrakRows.length} kontrak dibuat.`);

    // ---------------- permits (pakai permit_types yang SUDAH ada) ----------------
    const { rows: jenisIzin } = await client.query(
      `select id, kode from permit_types where kode in ('NIB','NPWP','IZIN_ANGKUTAN','IZIN_GUDANG','SIUP','UKL_UPL')`
    );
    const pt = Object.fromEntries(jenisIzin.map((r) => [r.kode, r.id]));
    const izinKolom = ['client_org_id', 'permit_type_id', 'nama_izin', 'nomor_izin', 'instansi_penerbit',
      'tanggal_terbit', 'tanggal_kedaluwarsa', 'tanpa_batas_waktu', 'status_siklus', 'pic_id'];
    const izinRows = await baris('permits', izinKolom, [
      { client_org_id: orgId, permit_type_id: pt.NIB, nama_izin: 'Nomor Induk Berusaha', nomor_izin: '9120001234567',
        instansi_penerbit: 'OSS - BKPM', tanggal_terbit: '2019-02-10', tanggal_kedaluwarsa: null, tanpa_batas_waktu: true, status_siklus: 'aktif', pic_id: IRFAN },
      { client_org_id: orgId, permit_type_id: pt.NPWP, nama_izin: 'NPWP Badan', nomor_izin: '02.345.678.9-012.000',
        instansi_penerbit: 'Direktorat Jenderal Pajak', tanggal_terbit: '2019-02-05', tanggal_kedaluwarsa: null, tanpa_batas_waktu: true, status_siklus: 'aktif', pic_id: IRFAN },
      { client_org_id: orgId, permit_type_id: pt.IZIN_ANGKUTAN, nama_izin: 'Izin Penyelenggaraan Angkutan Barang', nomor_izin: 'IZ-ANG/2024/00871',
        instansi_penerbit: 'Kemenhub', tanggal_terbit: '2024-01-20', tanggal_kedaluwarsa: '2029-01-19', tanpa_batas_waktu: false, status_siklus: 'aktif', pic_id: AGENG },
      { client_org_id: orgId, permit_type_id: pt.IZIN_GUDANG, nama_izin: 'Izin Operasional Gudang Marunda', nomor_izin: 'IZ-GDG/2025/00123',
        instansi_penerbit: 'DPMPTSP Jakarta Utara', tanggal_terbit: '2025-02-15', tanggal_kedaluwarsa: '2028-02-14', tanpa_batas_waktu: false, status_siklus: 'aktif', pic_id: AGENG },
      { client_org_id: orgId, permit_type_id: pt.SIUP, nama_izin: 'Surat Izin Usaha Perdagangan', nomor_izin: null,
        instansi_penerbit: 'DPMPTSP', tanggal_terbit: '2019-02-10', tanggal_kedaluwarsa: null, tanpa_batas_waktu: true, status_siklus: 'dalam_pengurusan', pic_id: IRFAN },
      { client_org_id: orgId, permit_type_id: pt.UKL_UPL, nama_izin: 'Izin Lingkungan Gudang Cikarang (UKL-UPL)', nomor_izin: null,
        instansi_penerbit: 'Dinas Lingkungan Hidup Bekasi', tanggal_terbit: null, tanggal_kedaluwarsa: null, tanpa_batas_waktu: false, status_siklus: 'dalam_pengurusan', pic_id: AGENG },
    ]);
    console.log(`  ${izinRows.length} izin dibuat.`);

    // ---------------- cases (litigasi) ----------------
    const { rows: perkaraRows } = await client.query(
      `insert into cases
         (client_org_id, nomor_perkara, jenis_perkara, peran_klien, lawan_pihak_teks, pengadilan,
          tahap, status_siklus, tanggal_daftar, pic_legal_id, created_by) values
       ($1,'112/Pdt.G/2025/PN.Jkt.Utr','Perdata - Wanprestasi','penggugat','PT Cipta Kargo Ekspres',
          'Pengadilan Negeri Jakarta Utara','mediasi','aktif','2025-04-02',$2,$3),
       ($1,'45/Pdt.Sus-BPSK/2025/PN.Bks','Perdata - Sengketa Konsumen','tergugat','Koperasi Karyawan Sumber Palet',
          'Pengadilan Negeri Bekasi','persidangan','aktif','2025-02-18',$2,$3),
       ($1,'8/Pdt.G/2024/PN.Jkt.Utr','Perdata - Perselisihan Sewa','penggugat','PT Gudang Sejahtera Abadi',
          'Pengadilan Negeri Jakarta Utara','selesai','selesai','2024-03-11',$2,$3)
       returning id, nomor_perkara`,
      [orgId, AGENG, IRFAN]
    );
    const perkaraId = perkaraRows[0].id;
    const { rows: sidangRows } = await client.query(
      `insert into hearings (case_id, tanggal_sidang, jam_sidang, agenda, status) values
         ($1, current_date + 9, '10:00', 'Mediasi lanjutan', 'terjadwal'),
         ($1, current_date - 21, '09:30', 'Mediasi pertama', 'selesai')
       returning id`,
      [perkaraId]
    );
    await client.query(
      `insert into hearing_minutes (case_id, hearing_id, isi, status, dicatat_oleh) values
       ($1,$2,'Mediasi pertama berlangsung, kedua pihak menyampaikan posisi masing-masing. Mediator menjadwalkan sesi lanjutan untuk membahas skema pembayaran.','final',$3)`,
      [perkaraId, sidangRows[1].id, AGENG]
    );
    console.log(`  ${perkaraRows.length} perkara dibuat (+ 2 sidang, 1 catatan sidang).`);

    // ---------------- legal_projects ----------------
    const { rows: proyekRows } = await client.query(
      `insert into legal_projects
         (client_org_id, nama_proyek, kategori, pic_legal_id, progress_persen, status, target_selesai, created_by) values
       ($1,'Restrukturisasi Perjanjian Vendor Armada','Korporasi',$2,60,'berjalan',current_date + 45,$3),
       ($1,'Audit Kepatuhan Perizinan Gudang','Perizinan',$4,100,'selesai',current_date - 10,$3),
       ($1,'Penyusunan SOP Ketenagakerjaan Sopir & Kurir','Ketenagakerjaan',$4,25,'berjalan',current_date + 90,$3)
       returning id`,
      [orgId, IRFAN, IRFAN, AGENG]
    );
    console.log(`  ${proyekRows.length} proyek legal dibuat.`);

    // ---------------- pendampingan_requests ----------------
    const { rows: pendampinganRows } = await client.query(
      `insert into pendampingan_requests
         (client_org_id, jenis, tanggal_kegiatan, lokasi, pihak_terlibat, deskripsi, status, pic_id, requested_by) values
       ($1,'negosiasi',current_date + 5,'Kantor KAL, Marunda','PT Cipta Kargo Ekspres','Negosiasi ulang tarif pengangkutan rute Jabodetabek','menunggu',$2,$3),
       ($1,'mediasi',current_date - 21,'Kantor Mediator, Jakarta Utara','PT Cipta Kargo Ekspres','Mediasi perkara 112/Pdt.G/2025/PN.Jkt.Utr','diproses',$2,$3),
       ($1,'due_diligence',current_date - 60,'Gudang Marunda & Cikarang','Internal','Due diligence sebelum perpanjangan sewa gudang Cikarang','selesai',$4,$3)
       returning id`,
      [orgId, AGENG, IRFAN, PUTRI]
    );
    console.log(`  ${pendampinganRows.length} permintaan pendampingan dibuat.`);

    // ---------------- akun pengguna sisi klien ----------------
    let clientUserId = null;
    const emailKlien = 'legal@kal.co.id';
    const { rows: userAda } = await client.query('select id from users where lower(email) = $1', [emailKlien]);
    if (userAda.length) {
      clientUserId = userAda[0].id;
    } else {
      const { rows: userBaru } = await client.query(
        `insert into users (email, nama, tipe) values ($1,$2,'client_user') returning id`,
        [emailKlien, 'Dewi Anggraini']
      );
      clientUserId = userBaru[0].id;
      try {
        const akun = await createAuthUser(emailKlien, DEMO_PASSWORD);
        await client.query('update users set auth_user_id = $1 where id = $2', [akun.id, clientUserId]);
      } catch (err) {
        console.log(`  (Supabase Auth untuk ${emailKlien} dilewati: ${err.message})`);
      }
    }
    await client.query(
      `insert into client_memberships (user_id, client_org_id, peran) values ($1,$2,'admin_klien')
       on conflict (user_id, client_org_id) do nothing`,
      [clientUserId, orgId]
    );
    console.log(`  Akun klien: ${emailKlien} / ${DEMO_PASSWORD} (peran admin_klien).`);

    // ---------------- dokumen sungguhan ----------------
    const berkas = [
      {
        pemilikId: orgId, entityType: 'client_org', entityId: orgId,
        namaFile: 'Akta_Pendirian_KAL.pdf', mime: 'application/pdf',
        buffer: minimalPdf('AKTA PENDIRIAN — PT KIRANA ANGKASA LOGISTIK', [
          'Nomor Akta: 17', 'Notaris: Rangga Wijaya, S.H., M.Kn.', 'Tanggal: 3 Februari 2019',
          '', '(Berkas contoh/seed data — bukan dokumen resmi.)',
        ]),
        uploadedBy: IRFAN,
      },
      {
        pemilikId: orgId, entityType: 'client_org', entityId: orgId,
        namaFile: 'Profil_Perusahaan_KAL.txt', mime: 'text/plain',
        buffer: teks('PT KIRANA ANGKASA LOGISTIK (KAL)\n\nSektor: Logistik & Kargo Udara\nAlamat: Jl. Marunda Center Blok C No. 12, Cilincing, Jakarta Utara\n\n(Berkas contoh/seed data.)'),
        uploadedBy: IRFAN,
      },
      {
        pemilikId: orgId, entityType: 'contract', entityId: kontrakRows[0].id,
        namaFile: 'PKS_Pengangkutan_Darat_Jabodetabek.pdf', mime: 'application/pdf',
        buffer: minimalPdf('PKS PENGANGKUTAN DARAT RUTE JABODETABEK', [
          'Nomor: 001/KAL-CKE/I/2025', 'Para pihak: PT Kirana Angkasa Logistik & PT Cipta Kargo Ekspres',
          'Masa berlaku: 15 Jan 2025 s.d. 14 Jan 2027', '', '(Berkas contoh/seed data.)',
        ]),
        uploadedBy: AGENG,
      },
      {
        pemilikId: orgId, entityType: 'permit', entityId: izinRows[2].id,
        namaFile: 'Sertifikat_Izin_Angkutan_Barang.pdf', mime: 'application/pdf',
        buffer: minimalPdf('IZIN PENYELENGGARAAN ANGKUTAN BARANG', [
          'Nomor: IZ-ANG/2024/00871', 'Instansi: Kementerian Perhubungan',
          'Berlaku s.d.: 19 Januari 2029', '', '(Berkas contoh/seed data.)',
        ]),
        uploadedBy: AGENG,
      },
      {
        pemilikId: orgId, entityType: 'case', entityId: perkaraId,
        namaFile: 'Surat_Gugatan_112-Pdt.G-2025.txt', mime: 'text/plain',
        buffer: teks('SURAT GUGATAN\nPerkara Nomor 112/Pdt.G/2025/PN.Jkt.Utr\nPenggugat: PT Kirana Angkasa Logistik\nTergugat: PT Cipta Kargo Ekspres\nPokok perkara: Wanprestasi pembayaran jasa angkutan.\n\n(Berkas contoh/seed data.)'),
        uploadedBy: AGENG,
      },
    ];
    for (const b of berkas) await unggahDokumen(client, b);
    console.log(`  ${berkas.length} berkas diunggah ke Supabase Storage.`);

    await client.query('COMMIT');
    console.log('\nSelesai. Organisasi demo "PT Kirana Angkasa Logistik (KAL)" siap dipakai.');
    console.log(`Login klien: ${emailKlien} / ${DEMO_PASSWORD}`);
    console.log('Login staf MIKK (sudah ada dari sebelumnya): irfan@mikklaws.com / MikkDemo!2026');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
