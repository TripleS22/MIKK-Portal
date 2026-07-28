/* =====================================================================
   MIKK Client Portal — portal calon klien (Fase 3)

   Dipisah dari app.js karena alurnya memang berbeda: portal retainer
   menampilkan data yang sudah ada, portal ini MENGUMPULKAN data lewat
   wizard bertahap. Menyatukannya berarti dua alur yang tidak saling
   berhubungan berbagi satu berkas 1.200 baris.

   URUTAN LANGKAH TIDAK BOLEH DIACAK. Kategori kasus harus diisi sebelum
   harga bisa dihitung, dan pemeriksaan benturan kepentingan harus lolos
   sebelum pembayaran dibuka — server menolak melanjutkan kalau dilangkahi
   (lihat server/routes/prospects.routes.js). Nomor pada penanda langkah
   mencerminkan urutan wajib itu, bukan hiasan.
   ===================================================================== */

const KATEGORI_NAMA = nameProxy('katLayanan');
const BENTURAN_NAMA = nameProxy('benturan');
const STATUS_KONSUL_NAMA = nameProxy('statusKonsul');

const P3 = {
  prospect: null,
  rows: [],
  rates: [],
  langkah: 1,          // 1 = klasifikasi, 2 = jadwal, 3 = ringkasan
  draft: {
    kategoriLayanan: null, kronologi: '', targetHukum: '', lawanPihakNama: '',
    jenisMeeting: null, tanggal: '', jamMulai: '', lokasi: '',
    kodeKupon: '', kuponInfo: null,
  },
  consultation: null,  // hasil langkah 1, dipakai langkah 2-3
  sibuk: false,
};

/* Jam layanan konsultasi. 12.00 sengaja dilewat — istirahat siang. */
const SLOT_JAM = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const KATEGORI_IKON = {
  pidana:    '<path d="m14 4 6 6M17 7l-6 6M4 20l6-6M9 11l4 4"/><path d="M3 21h8"/>',
  perdata:   '<path d="M8 11a4 4 0 0 1 4-4h5"/><path d="m14 4 3 3-3 3"/><path d="M16 13a4 4 0 0 1-4 4H7"/><path d="m10 20-3-3 3-3"/>',
  litigasi:  '<path d="M12 3v18M8 21h8"/><path d="m4 7 4-2 4 2M4 7l-2 5h8L8 7"/><path d="m12 7 4-2 4 2m0 0-2 5h8l-2-5"/>',
  korporasi: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
  lainnya:   '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3 2.4V13"/><path d="M12 16.5h.01"/>',
};
const MEETING_IKON = {
  online:            '<rect x="2" y="5" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
  offline_bandung:   '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
  offline_luar_kota: '<path d="m2 12 20-8-8 20-2-8z"/>',
};

/* Memetakan jenis_layanan di service_rates ke kode jenis pertemuan yang
   dipakai antarmuka dan endpoint booking. */
const JENIS_DARI_LAYANAN = {
  konsultasi_online:     'online',
  konsultasi_offline:    'offline_bandung',
  konsultasi_luar_kota:  'offline_luar_kota',
};

const rupiahP = (n) => n == null ? '—'
  : 'Rp ' + Number(n).toLocaleString(LANG === 'en' ? 'en-US' : 'id-ID');

function pErr(msg) {
  const el = $('#pApiErr'); if (!el) return;
  el.textContent = msg || ''; el.classList.toggle('on', !!msg);
}

/* ---------------------------------------------------------------- masuk */
async function masukPortalCalon() {
  document.querySelectorAll('.screen').forEach((s) => { s.style.display = 'none'; });
  $('#screenApp').style.display = 'none';
  $('#screenProspect').style.display = 'grid';

  try {
    const [{ prospect }, { rates }] = await Promise.all([Api.prospectMe(), Api.consultRates()]);
    P3.prospect = prospect;
    P3.rates = rates;
    $('#pWhoName').textContent = prospect.nama;
    $('#pWhoKode').textContent = prospect.kode_akses;
    $('#pAvInit').textContent = initials(prospect.nama);
    $('#pOrgName').textContent = prospect.nama;
    tandaiBahasaCalon();
    await muatKonsultasi();
    tampilDaftar();
  } catch (err) {
    pErr(err.message || t('prospect.loadError'));
  }
}

async function muatKonsultasi() {
  const { rows } = await Api.consultations();
  P3.rows = rows;
}

/* ---------------------------------------------------------------- daftar */
function tampilDaftar() {
  $('#pSecList').style.display = 'block';
  $('#pSecWizard').style.display = 'none';
  $('#pmDashBtn').classList.add('on');
  $('#pmListBtn').classList.remove('on');
  $('#pmNewBtn').classList.remove('on');
  $('#pPageDesc').textContent = t('prospect.listDesc');
  gambarKartuCalon();
  gambarTabelCalon();
}

function gambarKartuCalon() {
  const n = (f) => P3.rows.filter(f).length;
  $('#pCards').innerHTML = [
    statCard(t('prospect.card.total'), P3.rows.length, 'acc-info',
      t('prospect.card.total.note'), 'inbox'),
    statCard(t('prospect.card.ditinjau'), n((r) => r.putusan_benturan !== 'aman' && r.status !== 'ditolak'),
      'acc-warn', t('prospect.card.ditinjau.note'), 'clock'),
    statCard(t('prospect.card.terjadwal'), n((r) => r.tanggal), 'acc-ok',
      t('prospect.card.terjadwal.note'), 'cal'),
  ].join('');
}

function gambarTabelCalon() {
  $('#pEmpty').style.display = P3.rows.length ? 'none' : 'block';
  $('#pBody').innerHTML = P3.rows.map((r, i) => {
    const jadwal = r.tanggal
      ? `${esc(tglTampil(r.tanggal))}${r.jam_mulai ? ' · ' + esc(String(r.jam_mulai).slice(0, 5)) : ''}`
      : `<span style="color:var(--muted-2)">${esc(t('prospect.belumDijadwalkan'))}</span>`;
    const biaya = r.butuh_penawaran
      ? `<span style="color:var(--muted)">${esc(t('prospect.menyesuaikan'))}</span>`
      : (r.total != null ? rupiahP(r.total) : '—');
    return `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><span class="doc">${esc(r.nomor)}</span></td>
      <td><span class="tag">${esc(KATEGORI_NAMA[r.kategori_layanan] || r.kategori_layanan)}</span></td>
      <td>${jadwal}</td>
      <td><span class="doc">${biaya}</span></td>
      <td><span class="pill ${pillBenturan(r.putusan_benturan)}">${esc(BENTURAN_NAMA[r.putusan_benturan])}</span></td>
      <td><span class="pill ${pillStatusKonsul(r.status)}">${esc(STATUS_KONSUL_NAMA[r.status])}</span></td>
    </tr>`;
  }).join('');
}

const pillBenturan = (v) => ({
  aman: 'p-aman', perlu_ditinjau: 'p-peringatan',
  terbentur: 'p-kritis', belum_diperiksa: 'p-tidak_dipantau',
}[v] || 'p-tidak_dipantau');
const pillStatusKonsul = (v) => ({
  draf: 'p-tidak_dipantau', menunggu_tinjauan: 'p-peringatan',
  disetujui: 'p-aman', ditolak: 'p-kritis', selesai: 'p-pantau',
}[v] || 'p-tidak_dipantau');

/* ---------------------------------------------------------------- wizard */
function mulaiWizard() {
  P3.langkah = 1;
  P3.consultation = null;
  P3.draft = {
    kategoriLayanan: null, kronologi: '', targetHukum: '', lawanPihakNama: '',
    jenisMeeting: null, tanggal: '', jamMulai: '', lokasi: '',
    kodeKupon: '', kuponInfo: null,
  };
  $('#pSecList').style.display = 'none';
  $('#pSecWizard').style.display = 'block';
  $('#pmNewBtn').classList.add('on');
  $('#pmDashBtn').classList.remove('on');
  $('#pmListBtn').classList.remove('on');
  $('#pPageDesc').textContent = t('prospect.wizardDesc');
  pErr('');
  gambarWizard();
}

function gambarLangkah() {
  const langkah = [
    { n: 1, lb: t('prospect.step1'), sb: t('prospect.step1sub') },
    { n: 2, lb: t('prospect.step2'), sb: t('prospect.step2sub') },
    { n: 3, lb: t('prospect.step3'), sb: t('prospect.step3sub') },
  ];
  $('#pSteps').innerHTML = langkah.map((s) => {
    const cls = s.n < P3.langkah ? 'done' : s.n === P3.langkah ? 'on' : '';
    return `<div class="step ${cls}">
      <div class="num">${s.n < P3.langkah ? '✓' : s.n}</div>
      <div class="lb">${esc(s.lb)}</div>
      <div class="sb2">${esc(s.sb)}</div>
    </div>`;
  }).join('');
}

function gambarWizard() {
  gambarLangkah();
  if (P3.langkah === 1) gambarLangkah1();
  else if (P3.langkah === 2) gambarLangkah2();
  else gambarLangkah3();
  gambarRingkasan();
}

/* --- Langkah 1: klasifikasi kasus --- */
function gambarLangkah1() {
  const d = P3.draft;
  const kat = ['pidana', 'perdata', 'litigasi', 'korporasi', 'lainnya'];
  $('#pWizPanel').innerHTML = `
    <div class="panelhead"><div class="ttl2">
      <h3>${esc(t('prospect.step1'))}</h3>
      <p>${esc(t('prospect.step1desc'))}</p>
    </div></div>
    <div style="padding:18px">
      <div class="f" style="margin-bottom:16px">
        <label>${t('prospect.f.kategori')} <span class="req">*</span></label>
        <div class="pickgrid" id="pKat">
          ${kat.map((k) => `<button type="button" class="pick ${d.kategoriLayanan === k ? 'on' : ''}" data-kat="${k}">
            <span class="tick">✓</span>
            <span class="pico"><svg viewBox="0 0 24 24">${KATEGORI_IKON[k]}</svg></span>
            <span class="nm">${esc(KATEGORI_NAMA[k])}</span>
          </button>`).join('')}
        </div>
      </div>
      <div class="f" style="margin-bottom:14px">
        <label>${t('prospect.f.kronologi')} <span class="req">*</span></label>
        <textarea id="pKronologi" rows="6" maxlength="3000"
          placeholder="${esc(t('prospect.f.kronologiPh'))}">${esc(d.kronologi)}</textarea>
        <div class="hint"><span id="pKronCount">${d.kronologi.length}</span> / 3000 · ${esc(t('prospect.f.kronologiHint'))}</div>
      </div>
      <div class="f" style="margin-bottom:14px">
        <label>${t('prospect.f.target')}</label>
        <textarea id="pTarget" rows="3" maxlength="1500"
          placeholder="${esc(t('prospect.f.targetPh'))}">${esc(d.targetHukum)}</textarea>
      </div>
      <div class="f">
        <label>${t('prospect.f.lawan')}</label>
        <input id="pLawan" value="${esc(d.lawanPihakNama)}" placeholder="${esc(t('prospect.f.lawanPh'))}">
        <div class="hint">${esc(t('prospect.f.lawanHint'))}</div>
      </div>
      <div class="qnav" style="margin-top:18px">
        <button class="btn ghost" id="pBatal">${esc(t('common.cancel'))}</button>
        <button class="btn gold" id="pNext1">${esc(t('prospect.saveNext'))} →</button>
      </div>
    </div>`;

  document.querySelectorAll('#pKat .pick').forEach((b) => {
    b.onclick = () => { P3.draft.kategoriLayanan = b.dataset.kat; gambarWizard(); };
  });
  const kron = $('#pKronologi');
  kron.oninput = () => {
    P3.draft.kronologi = kron.value;
    $('#pKronCount').textContent = kron.value.length;
  };
  $('#pTarget').oninput = (e) => { P3.draft.targetHukum = e.target.value; };
  $('#pLawan').oninput = (e) => { P3.draft.lawanPihakNama = e.target.value; };
  $('#pBatal').onclick = () => tampilDaftar();
  $('#pNext1').onclick = kirimLangkah1;
}

async function kirimLangkah1() {
  const d = P3.draft;
  pErr('');
  if (!d.kategoriLayanan) return pErr(t('prospect.err.kategori'));
  if (d.kronologi.trim().length < 20) return pErr(t('prospect.err.kronologi'));
  if (P3.sibuk) return;

  const btn = $('#pNext1'); P3.sibuk = true;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const { consultation } = await Api.createConsultation({
      kategoriLayanan: d.kategoriLayanan,
      kronologi: d.kronologi.trim(),
      targetHukum: d.targetHukum.trim() || null,
      lawanPihakNama: d.lawanPihakNama.trim() || null,
    });
    P3.consultation = consultation;
    await muatKonsultasi();

    // Benturan kepentingan menutup alur di sini — tidak ada gunanya
    // menawarkan jadwal untuk perkara yang tidak bisa ditangani.
    if (consultation.putusan_benturan === 'terbentur') {
      P3.langkah = 3;
    } else {
      P3.langkah = 2;
    }
    gambarWizard();
  } catch (err) {
    pErr(err.message || t('common.saveFailed'));
  } finally {
    P3.sibuk = false;
    if ($('#pNext1')) { $('#pNext1').disabled = false; $('#pNext1').textContent = t('prospect.saveNext') + ' →'; }
  }
}

/* --- Langkah 2: jenis pertemuan, jadwal, kupon --- */
function gambarLangkah2() {
  const d = P3.draft;
  const hariIni = new Date().toISOString().slice(0, 10);
  const kartuTarif = P3.rates.map((r) => {
    const jenis = JENIS_DARI_LAYANAN[r.jenis_layanan];
    if (!jenis) return '';
    const harga = r.butuh_penawaran
      ? `<span class="hg" style="font-size:14px">${esc(t('prospect.menyesuaikan'))}</span>
         <span class="sat">${esc(t('prospect.hubungiAdmin'))}</span>`
      : `<span class="hg">${rupiahP(r.harga)}</span>
         <span class="sat">${esc(satuanTeks(r))}</span>`;
    return `<button type="button" class="pick ${d.jenisMeeting === jenis ? 'on' : ''}" data-jenis="${jenis}">
      <span class="tick">✓</span>
      <span class="pico"><svg viewBox="0 0 24 24">${MEETING_IKON[jenis]}</svg></span>
      <span class="nm">${esc(r.nama)}</span>
      ${r.deskripsi ? `<span class="ds">${esc(r.deskripsi)}</span>` : ''}
      ${harga}
    </button>`;
  }).join('');

  const luarKota = d.jenisMeeting === 'offline_luar_kota';

  $('#pWizPanel').innerHTML = `
    <div class="panelhead"><div class="ttl2">
      <h3>${esc(t('prospect.step2'))}</h3>
      <p>${esc(t('prospect.step2desc'))}</p>
    </div></div>
    <div style="padding:18px">
      <div class="f" style="margin-bottom:18px">
        <label>${t('prospect.f.jenis')} <span class="req">*</span></label>
        <div class="pickgrid" id="pJenis" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${kartuTarif}</div>
      </div>

      ${luarKota ? `
      <div class="f" style="margin-bottom:14px">
        <label>${t('prospect.f.lokasi')}</label>
        <input id="pLokasi" value="${esc(d.lokasi)}" placeholder="${esc(t('prospect.f.lokasiPh'))}">
        <div class="hint">${esc(t('prospect.luarKotaHint'))}</div>
      </div>` : ''}

      <div class="grid2" style="margin-bottom:14px">
        <div class="f">
          <label>${t('prospect.f.tanggal')}</label>
          <input type="date" id="pTanggal" min="${hariIni}" value="${esc(d.tanggal)}">
        </div>
      </div>
      <div class="f" style="margin-bottom:16px">
        <label>${t('prospect.f.jam')}</label>
        <div class="slots" id="pSlots">
          ${SLOT_JAM.map((j) => `<button type="button" class="slot ${d.jamMulai === j ? 'on' : ''}" data-jam="${j}">${j}</button>`).join('')}
        </div>
        <div class="hint">${esc(t('prospect.jamHint'))}</div>
      </div>

      ${luarKota ? '' : `
      <div class="f" style="margin-bottom:6px">
        <label>${t('prospect.f.kupon')}</label>
        <div class="couponrow">
          <input id="pKupon" value="${esc(d.kodeKupon)}" placeholder="${esc(t('prospect.f.kuponPh'))}">
          <button class="btn ghost" id="pTerapkan">${esc(t('prospect.terapkan'))}</button>
        </div>
        <div class="hint" id="pKuponInfo">${d.kuponInfo
          ? (d.kuponInfo.valid
              ? `<span style="color:var(--ok);font-weight:600">✓ ${esc(d.kuponInfo.alasan || '')} — ${rupiahP(d.kuponInfo.diskon)}</span>`
              : `<span style="color:var(--crit);font-weight:600">${esc(d.kuponInfo.alasan)}</span>`)
          : esc(t('prospect.kuponHint'))}</div>
      </div>`}

      <div class="qnav" style="margin-top:18px">
        <button class="btn ghost" id="pBack2">← ${esc(t('prospect.back'))}</button>
        <button class="btn gold" id="pNext2">${esc(t('prospect.toPayment'))} →</button>
      </div>
    </div>`;

  document.querySelectorAll('#pJenis .pick').forEach((b) => {
    b.onclick = () => {
      P3.draft.jenisMeeting = b.dataset.jenis;
      // Kupon tidak berlaku untuk luar kota (harga belum ditetapkan).
      if (P3.draft.jenisMeeting === 'offline_luar_kota') {
        P3.draft.kodeKupon = ''; P3.draft.kuponInfo = null;
      }
      gambarWizard();
    };
  });
  document.querySelectorAll('#pSlots .slot').forEach((b) => {
    b.onclick = () => { P3.draft.jamMulai = b.dataset.jam; gambarWizard(); };
  });
  $('#pTanggal').onchange = (e) => { P3.draft.tanggal = e.target.value; gambarRingkasan(); };
  if ($('#pLokasi')) $('#pLokasi').oninput = (e) => { P3.draft.lokasi = e.target.value; };
  if ($('#pKupon')) {
    $('#pKupon').oninput = (e) => { P3.draft.kodeKupon = e.target.value; };
    $('#pTerapkan').onclick = terapkanKupon;
  }
  $('#pBack2').onclick = () => { P3.langkah = 1; gambarWizard(); };
  $('#pNext2').onclick = kirimLangkah2;
}

function satuanTeks(r) {
  const per = { per_jam: t('prospect.perJam'), per_sesi: t('prospect.perSesi'), per_hari: t('prospect.perHari') }[r.satuan];
  return r.durasi_menit ? `${per} · ${r.durasi_menit} ${t('prospect.menit')}` : per;
}

async function terapkanKupon() {
  const d = P3.draft;
  if (!d.jenisMeeting) return pErr(t('prospect.err.jenisDulu'));
  if (!d.kodeKupon.trim()) { d.kuponInfo = null; gambarWizard(); return; }
  const btn = $('#pTerapkan'); btn.disabled = true;
  try {
    d.kuponInfo = await Api.previewCoupon({ kode: d.kodeKupon.trim(), jenisMeeting: d.jenisMeeting });
  } catch (err) {
    d.kuponInfo = { valid: false, alasan: err.message };
  } finally {
    btn.disabled = false;
    gambarWizard();
  }
}

async function kirimLangkah2() {
  const d = P3.draft;
  pErr('');
  if (!d.jenisMeeting) return pErr(t('prospect.err.jenis'));
  if (!d.tanggal) return pErr(t('prospect.err.tanggal'));
  if (!d.jamMulai) return pErr(t('prospect.err.jam'));
  if (P3.sibuk) return;

  const btn = $('#pNext2'); P3.sibuk = true;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const { consultation } = await Api.createBooking(P3.consultation.id, {
      jenisMeeting: d.jenisMeeting,
      tanggal: d.tanggal,
      jamMulai: d.jamMulai,
      lokasi: d.lokasi.trim() || null,
      kodeKupon: (d.kuponInfo && d.kuponInfo.valid) ? d.kodeKupon.trim() : null,
    });
    P3.consultation = consultation;
    await muatKonsultasi();
    P3.langkah = 3;
    gambarWizard();
  } catch (err) {
    pErr(err.message || t('common.saveFailed'));
  } finally {
    P3.sibuk = false;
    if ($('#pNext2')) { $('#pNext2').disabled = false; $('#pNext2').textContent = t('prospect.toPayment') + ' →'; }
  }
}

/* --- Langkah 3: konfirmasi --- */
function gambarLangkah3() {
  const c = P3.consultation || {};
  const terbentur = c.putusan_benturan === 'terbentur';
  const perluTinjau = c.putusan_benturan === 'perlu_ditinjau';

  // Pembayaran sengaja BELUM tersambung ke payment gateway. Menampilkan
  // tombol "Bayar" yang tidak benar-benar memproses uang akan menyesatkan
  // calon klien — lihat PRD Bagian 5.3.
  const isi = terbentur
    ? `<div class="warnbox wb-crit">
         <span class="ic">⚠</span>
         <div><b>${esc(t('prospect.conflictTitle'))}</b>${esc(c.alasan_benturan || t('prospect.conflictDesc'))}</div>
       </div>
       <p style="font-size:12.5px;color:var(--muted);line-height:1.65;margin:0 0 4px">
         ${esc(t('prospect.conflictNext'))}</p>`
    : `<div class="warnbox ${perluTinjau ? 'wb-warn' : 'wb-ok'}">
         <span class="ic">${perluTinjau ? '◆' : '✓'}</span>
         <div><b>${esc(perluTinjau ? t('prospect.reviewTitle') : t('prospect.okTitle'))}</b>
           ${esc(perluTinjau ? t('prospect.reviewDesc') : t('prospect.okDesc'))}</div>
       </div>
       <div class="warnbox wb-warn" style="margin-bottom:0">
         <span class="ic">🏦</span>
         <div><b>${esc(t('prospect.payPendingTitle'))}</b>${esc(t('prospect.payPendingDesc'))}</div>
       </div>`;

  $('#pWizPanel').innerHTML = `
    <div class="panelhead"><div class="ttl2">
      <h3>${esc(t('prospect.step3'))}</h3>
      <p>${esc(t('prospect.step3desc'))}</p>
    </div></div>
    <div style="padding:18px">
      ${c.nomor ? `<div class="acccode" style="background:var(--paper);color:var(--ink);border:1px solid var(--line)">
        <div class="kode" style="color:var(--gold-dk)">${esc(c.nomor)}</div>
        <div class="tx" style="color:var(--muted)">
          <b style="color:var(--ink)">${esc(t('prospect.nomorTitle'))}</b>
          ${esc(t('prospect.nomorDesc'))}
        </div>
      </div>` : ''}
      ${isi}
      <div class="qnav" style="margin-top:18px">
        <button class="btn ghost" id="pSelesai">${esc(t('prospect.backToList'))}</button>
      </div>
    </div>`;
  $('#pSelesai').onclick = () => tampilDaftar();
}

/* --- Ringkasan menempel di kanan --- */
function gambarRingkasan() {
  const d = P3.draft;
  const c = P3.consultation;
  const rate = P3.rates.find((r) => JENIS_DARI_LAYANAN[r.jenis_layanan] === d.jenisMeeting);
  const penawaran = rate ? rate.butuh_penawaran : false;
  const subtotal = rate && !penawaran ? Number(rate.harga) : null;
  const diskon = (d.kuponInfo && d.kuponInfo.valid) ? Number(d.kuponInfo.diskon) : 0;
  const total = subtotal == null ? null : Math.max(0, subtotal - diskon);

  const baris = (lbl, val, cls) =>
    `<div class="sumrow"><span class="lbl">${esc(lbl)}</span><span class="val ${cls || ''}">${val}</span></div>`;

  $('#pSummary').innerHTML = `
    <h4>${esc(t('prospect.summaryTitle'))}</h4>
    ${d.kategoriLayanan ? baris(t('prospect.f.kategori'), esc(KATEGORI_NAMA[d.kategoriLayanan])) : ''}
    ${rate ? baris(t('prospect.f.jenis'), esc(rate.nama)) : ''}
    ${d.tanggal ? baris(t('prospect.f.tanggal'), esc(tglTampil(d.tanggal))) : ''}
    ${d.jamMulai ? baris(t('prospect.f.jam'), esc(d.jamMulai) + ' WIB') : ''}
    ${rate && rate.durasi_menit ? baris(t('prospect.durasi'), rate.durasi_menit + ' ' + t('prospect.menit')) : ''}
    ${penawaran
      ? `<div class="warnbox wb-warn" style="margin:12px 0 0">
           <span class="ic">◆</span>
           <div><b>${esc(t('prospect.menyesuaikan'))}</b>${esc(t('prospect.luarKotaHint'))}</div>
         </div>`
      : subtotal != null
        ? `${baris(t('prospect.subtotal'), rupiahP(subtotal))}
           ${diskon > 0 ? baris(t('prospect.diskon'), '− ' + rupiahP(diskon), 'disc') : ''}
           <div class="sumrow total"><span class="lbl">${esc(t('prospect.total'))}</span>
             <span class="val">${rupiahP(total)}</span></div>`
        : `<p style="font-size:12px;color:var(--muted);margin:12px 0 0">${esc(t('prospect.summaryEmpty'))}</p>`}
    ${c && c.putusan_benturan ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
        <div class="sumrow" style="padding-top:0">
          <span class="lbl">${esc(t('prospect.th.benturan'))}</span>
          <span class="pill ${pillBenturan(c.putusan_benturan)}">${esc(BENTURAN_NAMA[c.putusan_benturan])}</span>
        </div>
      </div>` : ''}`;
}

/* ---------------------------------------------------------------- bahasa */
function tandaiBahasaCalon() {
  $('#pLangId').classList.toggle('on', LANG === 'id');
  $('#pLangEn').classList.toggle('on', LANG === 'en');
}

/* ---------------------------------------------------------------- event */
$('#pmDashBtn').onclick = () => tampilDaftar();
$('#pmListBtn').onclick = () => tampilDaftar();
$('#pmNewBtn').onclick = () => mulaiWizard();
$('#pNewCta').onclick = () => mulaiWizard();
$('#pLangId').onclick = () => setLang('id');
$('#pLangEn').onclick = () => setLang('en');
$('#pLogoutBtn').onclick = () => {
  Api.logout(); P3.prospect = null; P3.rows = [];
  $('#screenProspect').style.display = 'none';
  goLogin();
};

onLangChange(() => {
  if ($('#screenProspect').style.display === 'none') return;
  tandaiBahasaCalon();
  applyStaticI18n();
  if (P3.langkah && $('#pSecWizard').style.display !== 'none') gambarWizard();
  else tampilDaftar();
});

/* ---------------------------------------------------------------- daftar akun */
let regTipe = 'perorangan';

function setRegTipe(tipe) {
  regTipe = tipe;
  document.querySelectorAll('#registerForm .pick[data-tipe]').forEach((b) => {
    b.classList.toggle('on', b.dataset.tipe === tipe);
  });
  const badan = tipe === 'badan_usaha';
  $('#regPicWrap').style.display = badan ? 'flex' : 'none';
  $('#regNibWrap').style.display = badan ? 'flex' : 'none';
  $('#regNamaLabel').textContent = badan ? t('register.namaPerusahaan') : t('register.nama');
}

function goRegister() {
  $('#screenLogin').style.display = 'none';
  $('#screenRegister').style.display = 'flex';
  setRegTipe(regTipe);
}

document.querySelectorAll('#registerForm .pick[data-tipe]').forEach((b) => {
  b.onclick = () => setRegTipe(b.dataset.tipe);
});
$('#toRegisterBtn').onclick = goRegister;
$('#toLoginBtn').onclick = () => goLogin();

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#regBtn'), errEl = $('#regErr');
  errEl.classList.remove('on');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    const { prospect } = await Api.registerProspect({
      tipe: regTipe,
      nama: $('#regNama').value.trim(),
      email: $('#regEmail').value.trim(),
      password: $('#regPass').value,
      noHp: $('#regHp').value.trim() || null,
      namaPic: regTipe === 'badan_usaha' ? ($('#regPic').value.trim() || null) : null,
      nib: regTipe === 'badan_usaha' ? ($('#regNib').value.trim() || null) : null,
    });
    $('#screenRegister').style.display = 'none';
    await masukPortalCalon();
    // Kode akses hanya ditampilkan menonjol sekali, tepat setelah daftar.
    $('#pAccCode').innerHTML = `<div class="acccode">
      <div class="kode">${esc(prospect.kode_akses)}</div>
      <div class="tx"><b>${esc(t('prospect.kodeTitle'))}</b>${esc(t('prospect.kodeDesc'))}</div>
    </div>`;
  } catch (err) {
    errEl.textContent = err.message || t('register.failed');
    errEl.classList.add('on');
  } finally {
    btn.disabled = false; btn.textContent = t('register.submit');
  }
});
