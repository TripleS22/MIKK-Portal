/* =====================================================================
   MIKK Client Portal — front-end (Fase 1: CRM Kontrak)
   Semua data lewat Api.* (public/js/api.js). Tidak ada status waktu yang
   dihitung ulang secara berbeda dari server: sisa_hari, status_waktu, dan
   skor_kelengkapan SELALU dipakai apa adanya dari respons API, karena
   nilai itu berasal dari v_contracts_display — sumber tunggal yang sama
   dipakai laporan dan modul lain.
   ===================================================================== */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

/* ---------------------------------------------------------------- ikon
   Satu set garis-tunggal dipakai kartu statistik, feed, dan kolom aksi.
   Disimpan sebagai isi <svg> saja supaya pemanggilnya bisa mengatur ukuran. */
const ICONS = {
  file:   '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/>',
  check:  '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  clock:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  money:  '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  gap:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 9v4M12 16h.01"/>',
  scale:  '<path d="M12 3v18M8 21h8"/><path d="m4 7 4-2 4 2M4 7l-2 5h8L8 7"/><path d="m12 7 4-2 4 2m0 0-2 5h8l-2-5"/>',
  cal:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  gavel:  '<path d="m14 4 6 6M17 7l-6 6M4 20l6-6M9 11l4 4"/><path d="M3 21h8"/>',
  bank:   '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h3M8 16h6"/>',
  play:   '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z"/>',
  flag:   '<path d="M4 21V4M4 5h13l-2 4 2 4H4"/>',
  pause:  '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  users:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  inbox:  '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
  archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  disk:   '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 12h20"/><path d="M6 16h.01M10 16h.01"/>',
  eye:    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  dl:     '<path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M4 21h16"/>',
  trash:  '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ICONS.file}</svg>`;

/* Kartu statistik: judul, angka, ikon bernuansa, catatan bawah.
   Nilai panjang (mis. "Rp 8.500.000.000") diperkecil supaya tetap satu baris
   dan tidak mendorong kartunya turun ke baris grid berikutnya. */
function statCard(k, v, cls, note, icon) {
  // Angka mentah (kuantitas, bukan string yang sudah diformat seperti
  // rupiah()/fmtUkuran()) otomatis lewat pemisah ribuan di sini — satu
  // tempat, supaya tidak perlu membungkus tiap pemanggilan statCard() satu-satu.
  const tampil = typeof v === 'number' ? angka(v) : v;
  const panjang = String(tampil).length > 9 ? ' sm' : '';
  return `<div class="card ${cls}">
    <div class="body">
      <div class="k">${esc(k)}</div>
      <div class="v${panjang}">${esc(tampil)}</div>
      <div class="n">${esc(note)}</div>
    </div>
    <div class="ico">${ico(icon)}</div>
  </div>`;
}

/* Donut SVG + legenda. segs: [{label, value, color}] */
function donutHTML(segs, midValue, midLabel) {
  const total = segs.reduce((s, x) => s + Number(x.value || 0), 0);
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const rings = total === 0
    ? `<circle cx="64" cy="64" r="${R}" fill="none" stroke="#e3e8f0" stroke-width="18"/>`
    : segs.filter((s) => s.value > 0).map((s) => {
        const len = (s.value / total) * C;
        const el = `<circle cx="64" cy="64" r="${R}" fill="none" stroke="${s.color}" stroke-width="18"
          stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
        offset += len;
        return el;
      }).join('');
  const legend = segs.map((s) => {
    const pct = total ? Math.round((s.value / total) * 100) : 0;
    return `<div class="row"><span class="sw" style="background:${s.color}"></span>
      <span class="lb">${esc(s.label)}</span><span class="vl">${s.value} (${pct}%)</span></div>`;
  }).join('');
  return `<div class="donutwrap">
    <div class="donut" style="width:128px;height:128px">
      <svg width="128" height="128" viewBox="0 0 128 128">${rings}</svg>
      <div class="mid"><div><b>${midValue}</b><span>${esc(midLabel)}</span></div></div>
    </div>
    <div class="legend">${legend}</div>
  </div>`;
}

/* Bar horizontal berkategori. items: [{label, value, color}] */
function hbarsHTML(items) {
  const max = Math.max(1, ...items.map((i) => Number(i.value || 0)));
  const total = items.reduce((s, i) => s + Number(i.value || 0), 0);
  return `<div class="hbars">` + items.map((i) => {
    const pct = total ? Math.round((i.value / total) * 100) : 0;
    return `<div class="hbar">
      <div class="top"><span>${esc(i.label)}</span><span class="vl">${i.value} (${pct}%)</span></div>
      <div class="track"><div class="fill" style="width:${(i.value / max) * 100}%;background:${i.color}"></div></div>
    </div>`;
  }).join('') + `</div>`;
}

/* Progress bar untuk kolom tabel. */
function progHTML(pct, state) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="prog"><div class="track"><div class="fill ${state || ''}" style="width:${p}%"></div></div>
    <span class="pc">${p}%</span></div>`;
}

/* Inisial nama untuk avatar. */
const initials = (nama) => String(nama || '—').trim().split(/\s+/).map((x) => x[0] || '')
  .slice(0, 2).join('').toUpperCase() || '—';

/* PIC dengan avatar + jabatan, seperti rancangan referensi. */
function whoMini(nama, jabatan) {
  if (!nama) return '<span style="color:var(--muted-2)">—</span>';
  return `<div class="who-mini"><div class="av">${esc(initials(nama))}</div>
    <div><div class="nm">${esc(nama)}</div>${jabatan ? `<div class="rl">${esc(jabatan)}</div>` : ''}</div></div>`;
}

const CHART_COLORS = {
  ok: '#15803d', warn: '#c2700a', crit: '#c8213f', info: '#2563eb',
  repl: '#6d28d9', idle: '#98a4b6', gold: '#c9963f', teal: '#0d9488',
};

const PERAN_LABEL = nameProxy('peran');
const JABATAN_NAMA = nameProxy('jabatan');
const STATUS_NAMA = nameProxy('status');
const SIKLUS_NAMA = nameProxy('siklus', 'contracts_status_siklus');
const RELASI_NAMA = nameProxy('relasi', 'contracts_relasi_ke_induk');
const STATUS_KEYS = ['aman', 'pantau', 'peringatan', 'kritis', 'kedaluwarsa', 'digantikan', 'tanpa_batas', 'tidak_dipantau'];
const PERMIT_STATUS_NAMA = nameProxy('permitStatus', 'permits_status_siklus');
const JENIS_KLIEN_NAMA = nameProxy('jenisKlien');
const PROJEK_JENIS_NAMA = nameProxy('projekJenis');

const S = {
  user: null, ws: null, wsList: [],
  q: '', kat: '', stat: '', lengkap: '', sort: 'skor', dir: 'asc', page: 1, per: 15,
  view: 'table', ledRow: null,
  reference: null, ledger: [], list: { rows: [], total: 0 },
  editing: null, draft: null, err: null,
  quickQueue: [], quickIdx: 0,
};

/* ----------------------------------------------------------------
   TOAST — satu komponen notifikasi standar untuk seluruh aplikasi,
   4 varian (warna & ikon mengikuti token tema yang SUDAH ada di
   style.css: --ok/--warn/--crit dipakai juga oleh .warnbox/.pill,
   bukan warna baru): 'success' (aksi berhasil), 'error' (gagal —
   dari catch), 'warning' (validasi sebelum kirim — field belum
   diisi, dst.), 'info' (default, netral, dipakai kalau type
   dilewatkan atau tidak dikenali — perilaku toast() lama).
   ---------------------------------------------------------------- */
let tt;
const TOAST_IKON = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5l-5 5M9.5 9.5l5 5"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
function toast(msg, type) {
  type = TOAST_IKON[type] ? type : 'info';
  const el = $('#toast');
  el.className = 'toast t-' + type + ' on';
  el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TOAST_IKON[type]}</svg><span>${esc(msg)}</span>`;
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600);
}
function showApiErr(msg) {
  const el = $('#apiErr'); if (!el) return;
  el.textContent = msg; el.classList.toggle('on', !!msg);
}

/* ----------------------------------------------------------------
   CONFIRMDIALOG — pengganti window.confirm() bawaan browser, dipakai
   di mana pun sebelumnya ada `if (!window.confirm(...)) return;`.
   Kembalikan Promise<boolean> supaya pemanggilnya tetap `if (!(await
   confirmDialog(...))) return;` — pola yang sama, cuma tampilannya
   konsisten dengan tema (bukan popup asing bawaan browser).
   ---------------------------------------------------------------- */
function confirmDialog(msg, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    $('#confirmTitle').textContent = opts.title || t('confirm.title');
    $('#confirmMsg').textContent = msg;
    $('#confirmCancel').textContent = opts.cancelText || t('confirm.cancel');
    $('#confirmOk').textContent = opts.okText || t('confirm.okDefault');
    $('#confirmVeil').classList.add('on');
    $('#confirmBox').classList.add('on');
    const selesai = (hasil) => {
      $('#confirmVeil').classList.remove('on');
      $('#confirmBox').classList.remove('on');
      $('#confirmOk').onclick = null; $('#confirmCancel').onclick = null; $('#confirmVeil').onclick = null;
      resolve(hasil);
    };
    $('#confirmOk').onclick = () => selesai(true);
    $('#confirmCancel').onclick = () => selesai(false);
    $('#confirmVeil').onclick = () => selesai(false);
  });
}

/* ---------------------------------------------------------------- alur masuk */
Api.setUnauthorizedHandler(() => { S.user = null; S.ws = null; goLogin(); });

/* Kartu pemilih workspace — ikonnya mengikuti tipe workspace, seperti
   rancangan referensi (klien retainer vs ruang kerja advokat). */
function wsCardHTML(w, i) {
  const staf = w.tipe === 'staf_firma';
  return `<button class="wscard" data-i="${i}">
    <div class="wsico">${ico(staf ? 'scale' : 'bank')}</div>
    <div class="role">${esc(PERAN_LABEL[w.peran] || w.peran)}</div>
    <h3>${esc(w.nama_singkat || t('workspace.firmName'))}</h3>
    <p>${esc(w.nama_legal || t('workspace.firmDesc'))}</p>
  </button>`;
}

function goLogin() {
  $('#screenLogin').style.display = 'flex';
  $('#screenRegister').style.display = 'none';
  $('#screenWorkspace').style.display = 'none';
  $('#screenApp').style.display = 'none';
  const p = $('#screenProspect'); if (p) p.style.display = 'none';
}

/* Calon klien punya portal sendiri — tidak lewat pemilih workspace,
   karena mereka memang belum punya workspace klien mana pun. */
async function arahkanSetelahMasuk(user) {
  if (user && user.tipe === 'prospect') return masukPortalCalon();
  return goWorkspacePicker();
}
async function goWorkspacePicker() {
  const { workspaces } = await Api.workspaces();
  const firmRoles = workspaces.filter((w) => w.tipe === 'staf_firma');
  let list;
  if (firmRoles.length) {
    const { rows } = await Api.clientOrgs();
    list = rows.map((o) => ({
      client_org_id: o.client_org_id, nama_singkat: o.nama_singkat,
      nama_legal: o.nama_legal, peran: firmRoles[0].peran, tipe: 'staf_firma',
    }));
  } else {
    list = workspaces.filter((w) => w.client_org_id);
  }
  S.wsList = list;

  if (list.length === 0) {
    showApiErr(t('workspace.noAssignment'));
    return;
  }
  if (list.length === 1) return enterWorkspace(list[0]);

  $('#screenLogin').style.display = 'none';
  $('#screenWorkspace').style.display = 'flex';
  $('#wsGrid').innerHTML = list.map((w, i) => wsCardHTML(w, i)).join('');
  document.querySelectorAll('.wscard').forEach((b) => {
    b.onclick = () => enterWorkspace(list[Number(b.dataset.i)]);
  });
}

async function enterWorkspace(ws) {
  S.ws = ws;
  $('#screenLogin').style.display = 'none';
  $('#screenWorkspace').style.display = 'none';
  $('#screenApp').style.display = 'grid';
  $('#switchWsBtn').style.display = S.wsList.length > 1 ? 'inline-flex' : 'none';

  const me = await Api.me();
  S.user = me.user;
  $('#whoName').textContent = S.user.nama;
  $('#whoRole').textContent = PERAN_LABEL[ws.peran] || ws.peran;
  $('#avInit').textContent = initials(S.user.nama);
  $('#sbLabel').textContent = t(ws.tipe === 'staf_firma' ? 'sidebar.lawyerLabel' : 'sidebar.portalLabel');
  // Tarif hanya relevan bagi Managing Partner. Menyembunyikan tombolnya
  // bukan pengamanan — RLS yang menahan penulisan; ini sekadar tidak
  // menawarkan pintu yang memang terkunci.
  const bolehTarif = ws.tipe === 'staf_firma' && ws.peran === 'managing_partner';
  $('#modRatesBtn').style.display = bolehTarif ? 'flex' : 'none';
  $('#modMasterDataBtn').style.display = bolehTarif ? 'flex' : 'none';
  $('#modStaffUsersBtn').style.display = bolehTarif ? 'flex' : 'none';
  // "Perkara Saya" lintas klien hanya relevan untuk staf MIKK — klien sisi
  // portal retainer sudah melihat perkaranya sendiri lewat modul Litigasi.
  // Sekarang diakses lewat menu akun di topbar, bukan sidebar (lihat
  // Bagian 2: navigasi pribadi vs workspace klien di rencana migrasi).
  $('#menuMyCasesBtn').style.display = ws.tipe === 'staf_firma' ? 'flex' : 'none';
  S.masukPada = new Date();
  gambarKepalaHalaman();

  // Label opsi Master Data dimuat sekali per sesi masuk — dipakai
  // nameProxy sebagai fallback kedua (lihat public/js/i18n.js) untuk opsi
  // yang ditambahkan admin setelah rilis ini, sebelum kamus i18n statis
  // sempat diperbarui menyertakannya.
  try { setMasterDataLabels((await Api.masterData()).rows); } catch (e) { /* non-fatal: label jatuh ke kode mentah */ }

  await muatSemua();
  switchModuleAll('dashboard');
}

/* Cap waktu masuk: momennya disimpan sekali di S.masukPada, tapi
   formatnya dihitung ulang tiap render supaya ikut berganti bahasa. */
function stempelWaktu() {
  const d = S.masukPada || new Date();
  const tgl = d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'id-ID',
    { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString(LANG === 'en' ? 'en-GB' : 'id-ID',
    { hour: '2-digit', minute: '2-digit' });
  return `${tgl}, ${jam} WIB`;
}

/* ---------------------------------------------------------------- muat data */
async function muatSemua() {
  showApiErr('');
  try {
    const [ref, led] = await Promise.all([
      Api.reference(S.ws.client_org_id),
      Api.ledger(S.ws.client_org_id),
    ]);
    S.reference = ref;
    S.ledger = led.rows;
    isiSelectReferensi();
    await Promise.all([muatDashboard(), muatDaftar()]);
    render();
  } catch (err) {
    showApiErr(err.message || t('kontrak.loadError'));
  }
}
async function muatDashboard() {
  const { dashboard } = await Api.dashboard(S.ws.client_org_id);
  S.dashboard = dashboard;
}
async function muatDaftar() {
  const { rows, total } = await Api.listContracts({
    clientOrgId: S.ws.client_org_id, q: S.q, kategori: S.kat, status: S.stat,
    lengkap: S.lengkap, sort: S.sort, dir: S.dir, page: S.page, per: S.per,
  });
  S.list = { rows, total };
}
function isiSelectReferensi() {
  const r = S.reference;
  $('#fKat').innerHTML = `<option value="">${esc(t('kontrak.filter.allKategori'))}</option>` +
    r.kategori.map((k) => `<option value="${esc(k.nama)}">${esc(k.nama)}</option>`).join('');
  $('#fStat').innerHTML = `<option value="">${esc(t('kontrak.filter.allStatus'))}</option>` +
    STATUS_KEYS.map((v) => `<option value="${v}">${esc(STATUS_NAMA[v])}</option>`).join('');
}

/* ---------------------------------------------------------------- turunan tampilan */
const rupiah = (n) => (n == null ? '—' : 'Rp ' + Number(n).toLocaleString(LANG === 'en' ? 'en-US' : 'id-ID'));
// Pemisah ribuan untuk kuantitas non-uang (mis. jumlah dokumen/baris besar).
// Pengenal seperti NIK/NPWP/NIB sengaja TIDAK lewat sini — itu bukan
// kuantitas, memisahkannya dengan titik/koma justru menyesatkan.
const angka = (n) => (n == null ? '—' : Number(n).toLocaleString(LANG === 'en' ? 'en-US' : 'id-ID'));
const tglTampil = (iso) => !iso ? null : new Date(iso + 'T00:00:00')
  .toLocaleDateString(LANG === 'en' ? 'en-GB' : 'id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const sisaTeks = (d) => d < 0 ? t('common.daysAgo', { n: Math.abs(d) }) : t('common.daysLeft', { n: d });

/* ---------------------------------------------------------------- render: kartu */
function renderCards() {
  const d = S.dashboard || {};
  $('#cards').innerHTML = [
    statCard(t('kontrak.card.total'), d.total_kontrak ?? 0, 'acc-info', t('kontrak.card.total.note'), 'file'),
    statCard(t('kontrak.card.aktif'), d.kontrak_aktif ?? 0, 'acc-ok', t('kontrak.card.aktif.note'), 'check'),
    statCard(t('kontrak.card.akanBerakhir'), d.akan_berakhir_90h ?? 0, 'acc-warn', t('kontrak.card.akanBerakhir.note'), 'clock'),
    statCard(t('kontrak.card.kedaluwarsa'), d.kedaluwarsa ?? 0, 'acc-crit', t('kontrak.card.kedaluwarsa.note'), 'alert'),
    statCard(t('kontrak.card.diperpanjang'), d.sudah_diperpanjang ?? 0, 'acc-repl', t('kontrak.card.diperpanjang.note'), 'repeat'),
    statCard(t('kontrak.card.nilai'), rupiah(d.total_nilai), '', t('kontrak.card.nilai.note', { n: d.jumlah_bernilai ?? 0 }), 'money'),
  ].join('');
}

/* ---------------------------------------------------------------- render: tabel */
function renderTable() {
  const { rows, total } = S.list;
  const pages = Math.max(1, Math.ceil(total / S.per));
  $('#empty').style.display = rows.length ? 'none' : 'block';
  $('#empty').innerHTML = `<h3>${esc(t('kontrak.empty.title'))}</h3><p>${esc(t('kontrak.empty.desc'))}</p>`;

  const a = (S.page - 1) * S.per;
  $('#tbody').innerHTML = rows.map((c, i) => {
    const sw = c.status_waktu, d = c.sisa_hari, sk = Math.round((c.skor_kelengkapan || 0) * 5);
    const sisa = (sw === 'tanpa_batas' || d == null) ? `<span class="days na">—</span>`
      : `<span class="days ${d < 0 ? 'neg' : d <= 90 ? 'soon' : ''}">${sisaTeks(d)}</span>`;
    return `<tr data-id="${c.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${a + i + 1}</td>
      <td>${c.nomor_dokumen ? `<span class="doc">${esc(c.nomor_dokumen)}</span>` : `<span class="doc none">${esc(t('common.noNumberYet'))}</span>`}</td>
      <td><div class="ttl">${esc(c.judul)}</div>
        ${c.relasi_ke_induk ? `<div class="sub">↳ ${esc(RELASI_NAMA[c.relasi_ke_induk] || c.relasi_ke_induk)}</div>` : ''}
        ${c.catatan_migrasi ? `<div class="flag"><span>⚑</span><span>${esc(c.catatan_migrasi)}</span></div>` : ''}</td>
      <td>${c.lawan_pihak ? esc(c.lawan_pihak) : `<span style="color:var(--muted-2)">${esc(t('kontrak.belumDiisi'))}</span>`}</td>
      <td>${c.kategori_nama ? `<span class="tag">${esc(c.kategori_nama)}</span>` : '—'}</td>
      <td>${c.tanggal_mulai ? `<span class="doc">${esc(tglTampil(c.tanggal_mulai))}</span>`
             : `<span style="color:var(--muted-2)">—</span>`}</td>
      <td>${c.tanggal_berakhir ? `<span class="doc">${esc(tglTampil(c.tanggal_berakhir))}</span>`
             : `<span style="color:var(--muted-2)">${c.tanpa_batas_waktu ? esc(t('kontrak.tanpaBatas')) : '—'}</span>`}</td>
      <td>${sisa}</td>
      <td><span class="pill p-${sw}">${esc(STATUS_NAMA[sw] || sw)}</span></td>
      <td><div class="meter" title="${sk}/5">${[0,1,2,3,4].map((n) => `<i class="${n < sk ? 'f' : ''}"></i>`).join('')}</div></td>
    </tr>`;
  }).join('');

  $('#count').textContent = total ? t('kontrak.count', { a: a + 1, b: Math.min(a + S.per, total), total }) : '';
  const btn = (lbl, pg, on, dis) => `<button data-pg="${pg}" class="${on ? 'on' : ''}" ${dis ? 'disabled' : ''}>${lbl}</button>`;
  let html = btn('‹', S.page - 1, false, S.page === 1);
  const win = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - S.page) <= 1) win.push(i);
  let last = 0; win.forEach((i) => { if (last && i - last > 1) html += `<button disabled>…</button>`; html += btn(i, i, i === S.page, false); last = i; });
  html += btn('›', S.page + 1, false, S.page === pages);
  $('#pg').innerHTML = html;
}

/* ---------------------------------------------------------------- formulir kontrak */
function opsi(arr, val, ph) {
  return `<option value="">${esc(ph)}</option>` + arr.map((o) =>
    `<option value="${esc(o.v)}" ${val === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
}
function formHTML(c, err, lampiranId) {
  const d = S.draft, r = S.reference;
  const migrasi = c && c.catatan_migrasi
    ? `<div class="warnbox wb-warn"><span class="ic">⚑</span><div><b>${esc(t('kontrak.migrasi'))}</b> ${esc(c.catatan_migrasi)}</div></div>` : '';
  const e = (k) => (err && err[k]) ? `<div class="err">${esc(err[k])}</div>` : '';
  const miss = (k) => !d[k] ? 'miss' : '';
  const induk = r.induk.filter((x) => x.id !== (c && c.id))
    .map((x) => ({ v: x.id, l: (x.nomor_dokumen ? x.nomor_dokumen + ' — ' : '') + x.judul }));

  return `
  ${migrasi}
  <div id="conflictBox"></div>
  <div class="grid2">
    <div class="f"><label>${t('kontrak.f.nomor')}</label>
      <input id="i_nomor" class="${miss('nomor')}" value="${esc(d.nomor || '')}">
      <div class="hint">${t('kontrak.f.nomorHint')}</div>${e('nomor')}</div>
    <div class="f"><label>${t('kontrak.f.kategori')}</label>
      <select id="i_kategori">${opsi(r.kategori.map((k) => ({ v: k.id, l: k.nama })), d.kategoriId, t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('kontrak.f.judul')} <span class="req">*</span></label>
    <input id="i_judul" value="${esc(d.judul || '')}">${e('judul')}</div>
  <div class="f" style="margin-top:12px"><label>${t('kontrak.f.lawan')}</label>
    <input id="i_lawan" list="dl_lawan" class="${miss('lawanPihakNama')}" value="${esc(d.lawanPihakNama || '')}"
      placeholder="${esc(t('kontrak.f.lawanPh'))}" autocomplete="off">
    <datalist id="dl_lawan">${r.lawanPihak.map((p) => `<option value="${esc(p.nama_legal)}">`).join('')}</datalist>
    <div class="hint">${t('kontrak.f.lawanHint')}</div></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('kontrak.f.jenis')}</label>
      <select id="i_jenis">${opsi(r.jenisDokumen.map((j) => ({ v: j, l: j })), d.jenis, t('common.none'))}</select></div>
    <div class="f"><label>${t('kontrak.f.pic')}</label>
      <select id="i_pic">${opsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), d.picLegalId, t('common.none'))}</select></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('kontrak.f.mulai')}</label>
      <input type="date" id="i_mulai" class="${miss('mulai')}" value="${esc(d.mulai || '')}"></div>
    <div class="f"><label>${t('kontrak.f.akhir')}</label>
      <input type="date" id="i_akhir" class="${miss('akhir')}" value="${esc(d.akhir || '')}" ${d.tanpaBatas ? 'disabled' : ''}>${e('akhir')}</div>
  </div>
  <label class="chk"><input type="checkbox" id="i_batas" ${d.tanpaBatas ? 'checked' : ''}>
    <span><b>${t('kontrak.f.tanpaBatas')}</b>${t('kontrak.f.tanpaBatasDesc')}</span></label>
  <div class="f" style="margin-top:6px"><label>${t('kontrak.f.nilai')}</label>
    <input id="i_nilai" inputmode="numeric" class="${miss('nilai')}" value="${d.nilai != null ? d.nilai : ''}" ${d.nilaiTidakRelevan ? 'disabled' : ''}>
    <div class="hint">${t('kontrak.f.nilaiHint')}</div>${e('nilai')}</div>
  <label class="chk"><input type="checkbox" id="i_nirnilai" ${d.nilaiTidakRelevan ? 'checked' : ''}>
    <span><b>${t('kontrak.f.nirnilai')}</b>${t('kontrak.f.nirnilaiDesc')}</span></label>
  <div class="grid2" style="margin-top:6px">
    <div class="f"><label>${t('kontrak.f.status')}</label>
      <select id="i_status">${opsi(r.statusSiklus.map((v) => ({ v, l: SIKLUS_NAMA[v] || v })), d.status, t('common.none'))}</select></div>
    <div class="f"><label>${t('kontrak.f.notice')}</label>
      <input id="i_notice" inputmode="numeric" value="${d.notice != null ? d.notice : ''}"></div>
  </div>
  <label class="chk"><input type="checkbox" id="i_renew" ${d.autoRenew ? 'checked' : ''}>
    <span><b>${t('kontrak.f.renew')}</b>${t('kontrak.f.renewDesc')}</span></label>
  <div class="grid2" style="margin-top:6px">
    <div class="f"><label>${t('kontrak.f.induk')}</label>
      <select id="i_induk">${opsi(induk, d.indukId, t('common.noneParent'))}</select></div>
    <div class="f"><label>${t('kontrak.f.relasi')}</label>
      <select id="i_relasi">${opsi(r.relasi.map((v) => ({ v, l: RELASI_NAMA[v] || v })), d.relasi, t('common.noneParent'))}</select>${e('relasi')}</div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('kontrak.f.keterangan')}</label>
    <textarea id="i_ket" rows="3">${esc(d.keterangan || '')}</textarea></div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="${lampiranId || 'lampiran_kontrak'}"></div>
  </div>`;
}
function bacaForm() {
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const d = S.draft;
  d.nomor = g('i_nomor') || null;
  d.judul = g('i_judul');
  d.kategoriId = g('i_kategori') || null;
  d.lawanPihakNama = g('i_lawan') || null;
  d.jenis = g('i_jenis') || null;
  d.picLegalId = g('i_pic') || null;
  d.mulai = g('i_mulai') || null;
  d.tanpaBatas = $('#i_batas').checked;
  d.akhir = d.tanpaBatas ? null : (g('i_akhir') || null);
  const nv = g('i_nilai').replace(/[^\d]/g, '');
  d.nilaiTidakRelevan = $('#i_nirnilai').checked;
  d.nilai = d.nilaiTidakRelevan || nv === '' ? null : Number(nv);
  d.status = g('i_status') || 'draf';
  const nt = g('i_notice').replace(/[^\d]/g, '');
  d.notice = nt === '' ? null : Number(nt);
  d.autoRenew = $('#i_renew').checked;
  d.indukId = g('i_induk') || null;
  d.relasi = g('i_relasi') || null;
  d.keterangan = g('i_ket') || null;
}
function validasi(id) {
  const d = S.draft, err = {};
  if (!d.judul) err.judul = t('kontrak.err.judul');
  if (d.mulai && d.akhir && d.akhir < d.mulai) err.akhir = t('kontrak.err.akhir');
  if (d.relasi && !d.indukId) err.relasi = t('kontrak.err.relasi');
  return Object.keys(err).length ? err : null;
}
function pasangFormEvent(rerender) {
  ['i_batas', 'i_nirnilai'].forEach((id) => {
    const el = $('#' + id); if (el) el.addEventListener('change', () => { bacaForm(); rerender(); });
  });
  const lawan = $('#i_lawan');
  if (lawan) {
    // Conflict check berjalan langsung saat mengetik, tapi HANYA memperbarui
    // kotak peringatannya sendiri — bukan menggambar ulang seluruh formulir,
    // supaya fokus dan posisi kursor di kolom teks tidak terganggu.
    let deb;
    lawan.addEventListener('input', () => {
      clearTimeout(deb);
      const nama = lawan.value.trim();
      if (!nama) { renderConflictBox(null); return; }
      deb = setTimeout(async () => {
        try {
          const res = await Api.checkConflict(nama, S.ws.client_org_id);
          renderConflictBox(res);
        } catch (e) { /* jangan ganggu pengisian formulir kalau conflict check gagal */ }
      }, 350);
    });
  }
}
function renderConflictBox(res) {
  const box = $('#conflictBox'); if (!box) return;
  if (!res || res.putusan === 'aman' || res.putusan === 'belum_diperiksa') { box.innerHTML = ''; return; }
  const isCrit = res.putusan === 'terbentur';
  box.innerHTML = `<div class="warnbox ${isCrit ? 'wb-crit' : 'wb-warn'}">
    <span class="ic">${isCrit ? '⚠' : '◆'}</span>
    <div><b>${isCrit ? t('kontrak.conflict.crit') : t('kontrak.conflict.warn')}</b>
    ${esc(res.alasan || '')}</div></div>`;
}
function draftKosong() {
  return { nomor: null, judul: '', kategoriId: null, lawanPihakNama: null, jenis: null,
    picLegalId: null, mulai: null, akhir: null, tanpaBatas: false, nilai: null,
    nilaiTidakRelevan: false, status: 'draf', notice: null, autoRenew: false,
    indukId: null, relasi: null, keterangan: null };
}
function draftDariBaris(c) {
  return { nomor: c.nomor_dokumen, judul: c.judul, kategoriId: c.kategori_id,
    lawanPihakNama: c.lawan_pihak || null, jenis: c.jenis_dokumen, picLegalId: c.pic_legal_id,
    mulai: c.tanggal_mulai, akhir: c.tanggal_berakhir, tanpaBatas: c.tanpa_batas_waktu,
    nilai: c.nilai_kontrak, nilaiTidakRelevan: c.nilai_tidak_relevan, status: c.status_siklus,
    notice: c.notice_period_hari, autoRenew: c.auto_renew, indukId: c.parent_contract_id,
    relasi: c.relasi_ke_induk, keterangan: c.keterangan };
}

/* ---------------------------------------------------------------- drawer */
let drawerRow = null;
// Klik baris tabel dulu ke bukaDrawerView() (baca saja) — bukaDrawer()
// (form edit) sekarang HANYA dipanggil dari tombol "Edit" di dalam View,
// atau dari mode Isi Cepat (jalur terpisah, lihat renderQuick — sengaja
// TIDAK lewat View, itu memang alur cepat isi berturut-turut).
function bukaDrawer(row) {
  drawerRow = row; S.editing = row.id; S.draft = draftDariBaris(row);
  // Reset ke tombol Simpan — kalau sebelumnya drawer sempat dalam mode
  // View, tombolnya sempat dipakai untuk "Edit" (lihat bukaDrawerView).
  $('#dSave').textContent = t('common.save');
  $('#dSave').onclick = simpanDrawer;
  gambarDrawer();
  $('#veil').classList.add('on'); $('#drawer').classList.add('on');
  if (S.draft.lawanPihakNama) {
    Api.checkConflict(S.draft.lawanPihakNama, S.ws.client_org_id).then(renderConflictBox).catch(() => {});
  }
  setTimeout(() => { const el = $('#i_nomor'); if (el) el.focus(); }, 60);
}
function gambarDrawer(err) {
  $('#dTitle').textContent = t('kontrak.editTitle');
  $('#dBody').innerHTML = formHTML(drawerRow, err);
  pasangFormEvent(() => gambarDrawer());
  if (drawerRow) renderLampiranPanel('lampiran_kontrak', 'contract', drawerRow.id, { clientOrgId: S.ws.client_org_id });
}

/* View — dibuka lebih dulu dari klik baris tabel. Field bacaan saja,
   dokumen tetap bisa dilihat/diunggah (renderLampiranPanel yang sama
   dipakai form edit) — tombol "Edit" di footer-lah yang masuk ke form
   sungguhan (bukaDrawer). Sama pola dengan drawer View Profil
   Perusahaan sebelum itu jadi halaman penuh — di sini TETAP drawer
   (field kontrak jauh lebih sedikit, drawer masih cukup lega). */
function bukaDrawerView(row) {
  drawerRow = row;
  $('#dTitle').textContent = t('kontrak.drawerTitle');
  const picNama = row.pic_legal_id ? (S.reference.pic.find((p) => p.id === row.pic_legal_id) || {}).nama : null;
  const migrasi = row.catatan_migrasi
    ? `<div class="warnbox wb-warn"><span class="ic">⚑</span><div><b>${esc(t('kontrak.migrasi'))}</b> ${esc(row.catatan_migrasi)}</div></div>` : '';
  $('#dBody').innerHTML = `
    ${migrasi}
    <div class="grid2">
      ${fieldRowRoHTML(t('kontrak.f.nomor'), row.nomor_dokumen)}
      ${fieldRowRoHTML(t('kontrak.f.kategori'), row.kategori_nama)}
    </div>
    <div style="margin-top:12px">${fieldRowRoHTML(t('kontrak.f.judul'), row.judul)}</div>
    <div class="grid2" style="margin-top:12px">
      ${fieldRowRoHTML(t('kontrak.f.lawan'), row.lawan_pihak)}
      ${fieldRowRoHTML(t('kontrak.f.jenis'), row.jenis_dokumen)}
    </div>
    <div class="grid2" style="margin-top:12px">
      ${fieldRowRoHTML(t('kontrak.f.pic'), picNama)}
      ${fieldRowRoHTML(t('kontrak.f.status'), STATUS_NAMA[row.status_siklus] || row.status_siklus)}
    </div>
    <div class="grid2" style="margin-top:12px">
      ${fieldRowRoHTML(t('kontrak.f.mulai'), tglTampil(row.tanggal_mulai))}
      ${fieldRowRoHTML(t('kontrak.f.akhir'), row.tanpa_batas_waktu ? t('kontrak.tanpaBatas') : tglTampil(row.tanggal_berakhir))}
    </div>
    <div class="grid2" style="margin-top:12px">
      ${fieldRowRoHTML(t('kontrak.f.nilai'), row.nilai_tidak_relevan ? t('kontrak.f.nirnilai') : rupiah(row.nilai_kontrak))}
      ${fieldRowRoHTML(t('kontrak.f.renew'), row.auto_renew ? t('common.ya') : t('common.tidak'))}
    </div>
    ${row.auto_renew && row.notice_period_hari != null ? `<div style="margin-top:12px">${
      fieldRowRoHTML(t('kontrak.f.notice'), t('kontrak.f.hariSebelum', { n: row.notice_period_hari }))}</div>` : ''}
    ${row.relasi_ke_induk ? `<div style="margin-top:12px">${
      fieldRowRoHTML(t('kontrak.f.relasi'), RELASI_NAMA[row.relasi_ke_induk] || row.relasi_ke_induk)}</div>` : ''}
    ${row.keterangan ? `<div style="margin-top:12px">${fieldRowRoHTML(t('kontrak.f.keterangan'), row.keterangan)}</div>` : ''}
    <div style="margin-top:20px">
      <div class="hint" style="font-weight:600;color:var(--ink);margin-bottom:8px">${esc(t('kontrak.docsTitle'))}</div>
      <div id="lampiran_kontrak"></div>
    </div>`;
  renderLampiranPanel('lampiran_kontrak', 'contract', row.id, { clientOrgId: S.ws.client_org_id });
  $('#dSave').textContent = t('common.edit');
  $('#dSave').onclick = () => bukaDrawer(row);
  $('#veil').classList.add('on'); $('#drawer').classList.add('on');
}

function tutupDrawer() {
  S.editing = null; S.draft = null; drawerRow = null;
  $('#veil').classList.remove('on'); $('#drawer').classList.remove('on');
}
async function simpanDrawer() {
  bacaForm();
  const err = validasi(S.editing);
  if (err) return gambarDrawer(err);
  const btn = $('#dSave'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try {
    await Api.updateContract(S.editing, S.draft);
    tutupDrawer();
    await Promise.all([muatDashboard(), muatDaftar(), refreshLedgerRow()]);
    render();
    toast(t('common.saved'), 'success');
  } catch (e) {
    gambarDrawer({ _umum: e.message });
    toast(e.message || t('common.saveFailed'), 'error');
  } finally { btn.disabled = false; btn.textContent = t('common.save'); }
}
async function refreshLedgerRow() {
  const led = await Api.ledger(S.ws.client_org_id);
  S.ledger = led.rows;
}

/* ---------------------------------------------------------------- mode isi cepat */
function antreanLokal() {
  const FIELD_KEYS = ['f_nomor', 'f_lawan', 'f_mulai', 'f_akhir', 'f_nilai'];
  let src = S.ledger.slice();
  if (S.ledRow != null) src = src.filter((c) => !c[FIELD_KEYS[S.ledRow]]);
  else src = src.filter((c) => FIELD_KEYS.some((k) => !c[k]));
  return src.sort((a, b) => {
    const sa = FIELD_KEYS.reduce((n, k) => n + (a[k] ? 1 : 0), 0);
    const sb = FIELD_KEYS.reduce((n, k) => n + (b[k] ? 1 : 0), 0);
    return sa - sb;
  });
}
async function renderQuick() {
  const q = antreanLokal();
  $('#sideTitle').textContent = t('kontrak.quick.sideTitle');
  $('#sideList').innerHTML = [
    t('kontrak.quick.tip1'), t('kontrak.quick.tip2'), t('kontrak.quick.tip3'), t('kontrak.quick.tip4'),
  ].map((s) => `<li>${s}</li>`).join('');

  if (!q.length) {
    $('#qCard').innerHTML = `<div class="empty"><h3>${esc(t('kontrak.quick.doneTitle'))}</h3>
      <p>${esc(t('kontrak.quick.doneDesc'))}</p></div>`;
    return;
  }
  if (S.quickIdx >= q.length) S.quickIdx = 0;
  const ledgerRow = q[S.quickIdx];
  // Ledger hanya menyimpan flag per kolom; ambil seluruh field kontrak dari server.
  let full;
  try { ({ row: full } = await Api.getContract(ledgerRow.id)); }
  catch (e) { S.quickIdx++; return renderQuick(); }
  drawerRow = full; S.editing = full.id;
  if (!S.draft || S.draft._forId !== full.id) { S.draft = draftDariBaris(full); S.draft._forId = full.id; }
  gambarQuick(q, full);
}
function gambarQuick(q, c, err) {
  const sk = Math.round((c.skor_kelengkapan || 0) * 5);
  $('#qCard').innerHTML = `
    <div class="qhead">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span class="doc">${c.nomor_dokumen ? esc(c.nomor_dokumen) : `<span class="doc none">${esc(t('common.noNumberYet'))}</span>`}</span>
        <span style="font-size:11.5px;color:var(--muted);font-family:var(--mono)">${S.quickIdx + 1} / ${q.length} · ${sk}/5</span>
      </div>
      <h3>${esc(c.judul)}</h3>
    </div>
    ${formHTML(c, err, 'lampiran_kontrak_quick')}
    <div class="qnav">
      <button class="btn ghost" id="qPrev" ${S.quickIdx === 0 ? 'disabled' : ''}>${t('kontrak.quick.prev')}</button>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="qSkip">${t('kontrak.quick.skip')}</button>
        <button class="btn gold" id="qNext">${t('kontrak.quick.next')}</button>
      </div>
    </div>`;
  pasangFormEvent(() => gambarQuick(q, c));
  renderLampiranPanel('lampiran_kontrak_quick', 'contract', c.id, { clientOrgId: S.ws.client_org_id });
  if (S.draft.lawanPihakNama) {
    Api.checkConflict(S.draft.lawanPihakNama, S.ws.client_org_id).then(renderConflictBox).catch(() => {});
  }
  $('#qPrev').onclick = () => { S.quickIdx = Math.max(0, S.quickIdx - 1); S.draft = null; renderQuick(); };
  $('#qSkip').onclick = () => { S.quickIdx++; S.draft = null; renderQuick(); };
  $('#qNext').onclick = async () => {
    bacaForm();
    const err = validasi(c.id);
    if (err) return gambarQuick(q, c, err);
    const btn = $('#qNext'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      await Api.updateContract(c.id, S.draft);
      S.draft = null;
      await Promise.all([muatDashboard(), refreshLedgerRow()]);
      toast(t('common.saved'), 'success');
      renderCards(); renderQuick();
    } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); btn.disabled = false; btn.innerHTML = t('kontrak.quick.next'); }
  };
}

/* ---------------------------------------------------------------- render utama */
function render() {
  renderCards();
  $('#viewTable').style.display = S.view === 'table' ? 'block' : 'none';
  $('#viewQuick').style.display = S.view === 'quick' ? 'block' : 'none';
  $('#vTable').classList.toggle('on', S.view === 'table');
  $('#vQuick').classList.toggle('on', S.view === 'quick');
  if (S.view === 'table') renderTable(); else renderQuick();
}
async function terapkanFilterLaluRender() {
  await muatDaftar(); renderTable();
}

/* ---------------------------------------------------------------- event */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn'); const errEl = $('#loginErr');
  errEl.classList.remove('on');
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try {
    const d = await Api.login($('#email').value.trim(), $('#password').value);
    await arahkanSetelahMasuk(d.user);
  } catch (err) {
    errEl.textContent = err.message || t('login.genericError'); errEl.classList.add('on');
  } finally { btn.disabled = false; btn.textContent = t('login.submit'); }
});

$('#logoutBtn').onclick = () => { Api.logout(); S.user = null; S.ws = null; goLogin(); };
$('#switchWsBtn').onclick = () => {
  $('#screenApp').style.display = 'none';
  $('#screenWorkspace').style.display = 'flex';
  $('#wsGrid').innerHTML = S.wsList.map((w, i) => wsCardHTML(w, i)).join('');
  document.querySelectorAll('.wscard').forEach((b) => {
    b.onclick = () => enterWorkspace(S.wsList[Number(b.dataset.i)]);
  });
};

$('#vTable').onclick = () => { S.view = 'table'; render(); };
$('#vQuick').onclick = () => { S.view = 'quick'; S.quickIdx = 0; S.draft = null; render(); };

let searchDebounce;
$('#q').oninput = (e) => {
  S.q = e.target.value; S.page = 1;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => terapkanFilterLaluRender(), 280);
};
$('#fKat').onchange = (e) => { S.kat = e.target.value; S.page = 1; terapkanFilterLaluRender(); };
$('#fStat').onchange = (e) => { S.stat = e.target.value; S.page = 1; terapkanFilterLaluRender(); };
$('#fLengkap').innerHTML = `<option value="">${esc(t('kontrak.filter.allLengkap'))}</option>
  <option value="belum">${esc(t('kontrak.filter.belum'))}</option><option value="sudah">${esc(t('kontrak.filter.sudah'))}</option>`;
$('#fLengkap').onchange = (e) => { S.lengkap = e.target.value; S.page = 1; terapkanFilterLaluRender(); };
$('#resetBtn').onclick = () => {
  S.q = ''; S.kat = ''; S.stat = ''; S.lengkap = ''; S.ledRow = null; S.page = 1;
  $('#q').value = ''; $('#fKat').value = ''; $('#fStat').value = ''; $('#fLengkap').value = '';
  terapkanFilterLaluRender();
};
$('#pg').onclick = (e) => {
  const b = e.target.closest('button[data-pg]'); if (!b || b.disabled) return;
  S.page = Number(b.dataset.pg); terapkanFilterLaluRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#tbody').onclick = (e) => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  const row = S.list.rows.find((r) => r.id === tr.dataset.id);
  if (row) bukaDrawerView(row);
};
document.querySelectorAll('thead th.srt').forEach((th) => {
  th.onclick = () => {
    const s = th.dataset.s;
    if (S.sort === s) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = s; S.dir = 'asc'; }
    terapkanFilterLaluRender();
  };
});
$('#dClose').onclick = tutupDrawer; $('#dCancel').onclick = tutupDrawer; $('#veil').onclick = tutupDrawer;
$('#dSave').onclick = simpanDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#drawer').classList.contains('on')) tutupDrawer(); });

/* ================================================================
   MODUL PERIZINAN
   ================================================================ */
const P = { rows: [], ref: null, dashboard: null, gap: [], editing: null, draft: null, loaded: false };

/* Catatan: pemilih modul (switchModuleAll) didefinisikan di bagian bawah
   berkas ini, setelah seluruh modul (Litigasi, Proyek, Pendampingan, Dokumen)
   didefinisikan — supaya satu fungsi bisa menangani keenam modul sekaligus. */

async function muatPermitsSemua() {
  showApiErr('');
  try {
    const [ref, list, dash, gap] = await Promise.all([
      Api.permitReference(S.ws.client_org_id),
      Api.permits(S.ws.client_org_id),
      Api.permitsDashboard(S.ws.client_org_id),
      Api.permitGap(S.ws.client_org_id),
    ]);
    P.ref = ref; P.rows = list.rows; P.dashboard = dash.dashboard; P.gap = gap.rows; P.loaded = true;
    renderPermitCards(); renderPermitTable(); renderGap();
  } catch (err) {
    showApiErr(err.message || t('permits.loadError'));
  }
}

function renderPermitCards() {
  const d = P.dashboard || {};
  $('#permitCards').innerHTML = [
    statCard(t('permits.card.total'), d.total_izin ?? 0, 'acc-info', t('permits.card.total.note'), 'shield'),
    statCard(t('permits.card.aktif'), d.izin_aktif ?? 0, 'acc-ok', t('permits.card.aktif.note'), 'check'),
    statCard(t('permits.card.akanBerakhir'), d.akan_berakhir ?? 0, 'acc-warn', t('permits.card.akanBerakhir.note'), 'clock'),
    statCard(t('permits.card.kedaluwarsa'), d.kedaluwarsa ?? 0, 'acc-crit', t('permits.card.kedaluwarsa.note'), 'alert'),
    statCard(t('permits.card.pengurusan'), d.dalam_pengurusan ?? 0, '', t('permits.card.pengurusan.note'), 'repeat'),
    statCard(t('permits.card.gap'), d.gap_wajib ?? 0, d.gap_wajib > 0 ? 'acc-crit' : 'acc-ok', t('permits.card.gap.note'), 'gap'),
  ].join('');

  const donut = $('#permitDonut');
  if (donut) {
    donut.innerHTML = donutHTML([
      { label: t('status.aman'),         value: d.izin_aktif ?? 0,       color: CHART_COLORS.ok },
      { label: t('permits.legendSoon'),  value: d.akan_berakhir ?? 0,    color: CHART_COLORS.warn },
      { label: t('status.kedaluwarsa'),  value: d.kedaluwarsa ?? 0,      color: CHART_COLORS.crit },
      { label: t('permits.legendGap'),   value: (P.gap || []).length,    color: CHART_COLORS.idle },
    ], d.total_izin ?? 0, t('permits.card.total'));
  }
}
function renderPermitTable() {
  $('#permitEmpty').style.display = P.rows.length ? 'none' : 'block';
  $('#permitBody').innerHTML = P.rows.map((p, i) => {
    const sw = p.status_waktu, d = p.sisa_hari;
    const sisa = (sw === 'tanpa_batas' || d == null) ? `<span class="days na">—</span>`
      : `<span class="days ${d < 0 ? 'neg' : d <= 60 ? 'soon' : ''}">${sisaTeks(d)}</span>`;
    const pic = P.ref?.pic.find((x) => x.id === p.pic_id);
    return `<tr data-id="${p.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(p.nama_izin)}</div></td>
      <td>${p.nomor_izin ? `<span class="doc">${esc(p.nomor_izin)}</span>` : `<span class="doc none">${esc(t('common.noNumberYet'))}</span>`}</td>
      <td>${esc(p.instansi_penerbit || '—')}</td>
      <td>${p.tanggal_terbit ? esc(tglTampil(p.tanggal_terbit)) : '—'}</td>
      <td>${p.tanggal_kedaluwarsa ? esc(tglTampil(p.tanggal_kedaluwarsa)) : (p.tanpa_batas_waktu ? esc(t('kontrak.tanpaBatas')) : '—')}</td>
      <td>${sisa}</td>
      <td><span class="pill p-${sw}">${esc(STATUS_NAMA[sw] || sw)}</span></td>
      <td>${whoMini(pic?.nama, pic?.jabatan ? JABATAN_NAMA[pic.jabatan] : null)}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#permitBody tr[data-id]').forEach((tr) => {
    tr.onclick = () => bukaPermitDrawer(P.rows.find((p) => p.id === tr.dataset.id));
  });
}
function renderGap() {
  if (!P.gap.length) {
    $('#gapBody').innerHTML = `<p style="font-size:12.5px;color:var(--muted);margin:0">${esc(t('permits.gap.none'))}</p>`;
    return;
  }
  $('#gapBody').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">` +
    P.gap.map((g) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;background:#f8fafc;border-radius:8px">
      <div><b style="font-size:12.5px">${esc(g.nama)}</b>
        <div style="font-size:11px;color:var(--muted)">${esc(g.instansi || '')}</div></div>
      <span class="pill ${g.wajib ? 'p-kritis' : 'p-pantau'}">${g.wajib ? esc(t('permits.gap.wajib')) : esc(t('permits.gap.opsional'))}</span>
    </div>`).join('') + `</div>`;
}

function permitOpsi(arr, val, ph) {
  return `<option value="">${esc(ph)}</option>` + arr.map((o) =>
    `<option value="${esc(o.v)}" ${val === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
}
function permitFormHTML(err) {
  const d = P.draft, r = P.ref, e = (k) => (err && err[k]) ? `<div class="err">${esc(err[k])}</div>` : '';
  return `
  <div class="grid2">
    <div class="f"><label>${t('permits.f.jenis')}</label>
      <select id="p_type">${permitOpsi(r.permitTypes.map((pt) => ({ v: pt.id, l: pt.nama + (pt.wajib ? t('permits.f.wajib') : '') })), d.permitTypeId, t('common.none'))}</select></div>
    <div class="f"><label>${t('permits.f.pic')}</label>
      <select id="p_pic">${permitOpsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), d.picId, t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('permits.f.nama')} <span class="req">*</span></label>
    <input id="p_nama" value="${esc(d.namaIzin || '')}">${e('namaIzin')}</div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('permits.f.nomor')}</label><input id="p_nomor" value="${esc(d.nomorIzin || '')}"></div>
    <div class="f"><label>${t('permits.f.instansi')}</label><input id="p_instansi" value="${esc(d.instansiPenerbit || '')}"></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('permits.f.terbit')}</label><input type="date" id="p_terbit" value="${esc(d.tanggalTerbit || '')}"></div>
    <div class="f"><label>${t('permits.f.kedaluwarsa')}</label>
      <input type="date" id="p_kadaluarsa" value="${esc(d.tanggalKedaluwarsa || '')}" ${d.tanpaBatas ? 'disabled' : ''}>${e('tanggalKedaluwarsa')}</div>
  </div>
  <label class="chk"><input type="checkbox" id="p_batas" ${d.tanpaBatas ? 'checked' : ''}>
    <span><b>${t('permits.f.tanpaBatas')}</b>${t('permits.f.tanpaBatasDesc')}</span></label>
  <div class="f" style="margin-top:6px"><label>${t('permits.f.status')}</label>
    <select id="p_status">${opsi(r.statusSiklus.map((v) => ({ v, l: PERMIT_STATUS_NAMA[v] || v })), d.status, t('common.none'))}</select></div>
  <div class="f" style="margin-top:12px"><label>${t('permits.f.keterangan')}</label><textarea id="p_ket" rows="3">${esc(d.keterangan || '')}</textarea></div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="lampiran_izin"></div>
  </div>`;
}
function bacaPermitForm() {
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const d = P.draft;
  d.permitTypeId = g('p_type') || null;
  d.picId = g('p_pic') || null;
  d.namaIzin = g('p_nama');
  d.nomorIzin = g('p_nomor') || null;
  d.instansiPenerbit = g('p_instansi') || null;
  d.tanggalTerbit = g('p_terbit') || null;
  d.tanpaBatas = $('#p_batas').checked;
  d.tanggalKedaluwarsa = d.tanpaBatas ? null : (g('p_kadaluarsa') || null);
  d.status = g('p_status') || 'aktif';
  d.keterangan = g('p_ket') || null;
}
function validasiPermit() {
  const d = P.draft, err = {};
  if (!d.namaIzin) err.namaIzin = t('permits.err.nama');
  if (d.tanggalTerbit && d.tanggalKedaluwarsa && d.tanggalKedaluwarsa < d.tanggalTerbit)
    err.tanggalKedaluwarsa = t('permits.err.kedaluwarsa');
  return Object.keys(err).length ? err : null;
}
function bukaPermitDrawer(row) {
  P.editing = row ? row.id : null;
  P.draft = row ? {
    permitTypeId: row.permit_type_id, picId: row.pic_id, namaIzin: row.nama_izin,
    nomorIzin: row.nomor_izin, instansiPenerbit: row.instansi_penerbit,
    tanggalTerbit: row.tanggal_terbit, tanggalKedaluwarsa: row.tanggal_kedaluwarsa,
    tanpaBatas: row.tanpa_batas_waktu, status: row.status_siklus, keterangan: row.keterangan,
  } : { permitTypeId: null, picId: null, namaIzin: '', nomorIzin: null, instansiPenerbit: null,
        tanggalTerbit: null, tanggalKedaluwarsa: null, tanpaBatas: false, status: 'aktif', keterangan: null };
  gambarPermitDrawer();
  $('#veil').classList.add('on'); $('#permitDrawer').classList.add('on');
  setTimeout(() => { const el = $('#p_nama'); if (el) el.focus(); }, 60);
}
function gambarPermitDrawer(err) {
  $('#permitDTitle').textContent = P.editing ? t('permits.drawerTitle') : t('permits.drawerTitleNew');
  $('#permitDBody').innerHTML = permitFormHTML(err);
  renderLampiranPanel('lampiran_izin', 'permit', P.editing, { clientOrgId: S.ws.client_org_id });
  const batas = $('#p_batas');
  if (batas) batas.addEventListener('change', () => { bacaPermitForm(); gambarPermitDrawer(); });
}
function tutupPermitDrawer() {
  P.editing = null; P.draft = null;
  $('#veil').classList.remove('on'); $('#permitDrawer').classList.remove('on');
}
async function simpanPermit() {
  bacaPermitForm();
  const err = validasiPermit();
  if (err) return gambarPermitDrawer(err);
  const btn = $('#permitDSave'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
  try {
    if (P.editing) await Api.updatePermit(P.editing, P.draft);
    else await Api.createPermit({ ...P.draft, clientOrgId: S.ws.client_org_id });
    tutupPermitDrawer();
    await muatPermitsSemua();
    toast(t('common.saved'), 'success');
  } catch (e) {
    gambarPermitDrawer({ _umum: e.message });
    toast(e.message || t('common.saveFailed'), 'error');
  } finally { btn.disabled = false; btn.textContent = t('common.save'); }
}
$('#addPermitBtn').onclick = () => bukaPermitDrawer(null);
$('#permitDClose').onclick = tutupPermitDrawer;
$('#permitDCancel').onclick = tutupPermitDrawer;
$('#permitDSave').onclick = simpanPermit;
$('#veil').addEventListener('click', () => { if ($('#permitDrawer').classList.contains('on')) tutupPermitDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#permitDrawer').classList.contains('on')) tutupPermitDrawer(); });

/* ================================================================
   PEMILIH MODUL — enam modul berbagi satu baris tombol
   ================================================================ */
/* Satu tempat yang memetakan modul → section, tombol sidebar, judul, dan
   pemuat datanya. Menambah modul cukup menambah satu baris di sini. */
const MODULES = [
  { id: 'dashboard',    sec: 'secDashboard',    btn: 'modDashboardBtn',    crumb: 'nav.dashboard',    desc: 'dashboard.desc' },
  { id: 'kontrak',      sec: 'secKontrak',      btn: 'modKontrakBtn',      crumb: 'nav.kontrak',      desc: 'kontrak.pageDesc' },
  { id: 'permits',      sec: 'secPermits',      btn: 'modPermitsBtn',      crumb: 'nav.permits',      desc: 'permits.desc' },
  { id: 'cases',        sec: 'secCases',        btn: 'modCasesBtn',        crumb: 'nav.cases',        desc: 'cases.desc' },
  { id: 'projects',     sec: 'secProjects',     btn: 'modProjectsBtn',     crumb: 'nav.projects',     desc: 'projects.desc' },
  { id: 'pendampingan', sec: 'secPendampingan', btn: 'modPendampinganBtn', crumb: 'nav.pendampingan', desc: 'pendampingan.desc' },
  { id: 'docs',         sec: 'secDocs',         btn: 'modDocsBtn',         crumb: 'nav.docs',         desc: 'docs.desc' },
  { id: 'team',         sec: 'secTeam',         btn: 'modTeamBtn',         crumb: 'nav.team',         desc: 'team.desc' },
  { id: 'rates',        sec: 'secRates',        btn: 'modRatesBtn',        crumb: 'nav.rates',        desc: 'rates.desc' },
  { id: 'masterdata',   sec: 'secMasterData',   btn: 'modMasterDataBtn',  crumb: 'nav.masterData',  desc: 'masterData.desc' },
  { id: 'staffusers',   sec: 'secStaffUsers',   btn: 'modStaffUsersBtn',  crumb: 'nav.staffUsers',  desc: 'staffUsers.desc' },
  // Dua di bawah ini pribadi/lintas klien — dipicu dari menu akun di
  // topbar (#menuMyCasesBtn/#menuProfileBtn), BUKAN sidebar, supaya
  // tidak tercampur dengan modul milik satu workspace klien di atas.
  { id: 'mycases',      sec: 'secMyCases',      btn: 'menuMyCasesBtn',     crumb: 'nav.mycases',      desc: 'mycases.desc' },
  { id: 'profile',      sec: 'secProfile',      btn: 'menuProfileBtn',     crumb: 'nav.profile',      desc: 'profile.desc' },
  // Dipicu dari tombol "Lihat Profil" di panel ringkas Dashboard — tidak
  // ada tombol sidebar/topbar sendiri (btn: null, switchModuleAll aman
  // terhadap ini, lihat gambarKepalaHalaman/MODULES.forEach di bawah).
  { id: 'companyprofile', sec: 'secCompanyProfile', btn: null, crumb: 'companyProfile.viewTitle', desc: 'companyProfile.pageDesc' },
];
let modAktif = 'dashboard';

function switchModuleAll(mod) {
  tutupDrawer(); tutupPermitDrawer(); tutupAuxDrawer();
  modAktif = mod;
  MODULES.forEach((m) => {
    const el = $('#' + m.sec); if (el) el.style.display = m.id === mod ? 'block' : 'none';
    const b = $('#' + m.btn);  if (b) b.classList.toggle('on', m.id === mod);
  });
  gambarKepalaHalaman();
  if (mod === 'dashboard') muatDashboardRingkas();
  if (mod === 'mycases' && !MC.loaded) muatMyCasesSemua();
  if (mod === 'permits' && !P.loaded) muatPermitsSemua();
  if (mod === 'cases' && !CS.loaded) muatCasesSemua();
  if (mod === 'projects' && !PJ.loaded) muatProjectsSemua();
  if (mod === 'pendampingan' && !PD.loaded) muatPendampinganSemua();
  if (mod === 'docs' && !DC.loaded) muatDocsSemua();
  if (mod === 'team' && !TM.loaded) muatTimSemua();
  if (mod === 'rates' && !RT.loaded) muatTarifSemua();
  if (mod === 'masterdata' && !MD.loaded) muatMasterDataSemua();
  if (mod === 'staffusers' && !SU.loaded) muatStaffUsersSemua();
  if (mod === 'profile' && !PR.loaded) muatProfilSemua();
  if (mod === 'companyprofile') { KP_PROFIL.mode = 'view'; renderCompanyProfilePage(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#userMenu').style.display = 'none';
}

/* Breadcrumb + judul halaman: nama organisasi tetap, keterangan ikut modul. */
function gambarKepalaHalaman() {
  const m = MODULES.find((x) => x.id === modAktif) || MODULES[0];
  // Di Dashboard, breadcrumb-nya berhenti di situ — tidak "Dashboard › Dashboard".
  const diAkar = m.id === 'dashboard';
  $('#crumbSep').style.display = diAkar ? 'none' : '';
  $('#crumbCur').style.display = diAkar ? 'none' : '';
  $('#crumbCur').textContent = t(m.crumb);
  $('#phDesc').textContent = t(m.desc);
  $('#phStamp').textContent = t('pagehead.lastLogin', { when: stempelWaktu() });
  if (S.ws) {
    $('#phOrg').textContent = S.ws.nama_legal || S.ws.nama_singkat || '—';
    $('#phBadge').textContent = PERAN_LABEL[S.ws.peran] || S.ws.peran || '';
    $('#orgName').textContent = S.ws.nama_singkat || S.ws.nama_legal || '—';
  }
}

MODULES.forEach((m) => {
  const b = $('#' + m.btn);
  if (b) b.onclick = () => switchModuleAll(m.id);
});
$('#crumbHome').onclick = () => switchModuleAll('dashboard');

/* Menu akun topbar (Profil Saya / Perkara Saya / Keluar) — lihat Bagian 2
   rencana migrasi: dipisah dari sidebar supaya tidak tercampur dengan
   modul milik satu workspace klien. */
$('#userMenuBtn').addEventListener('click', (e) => {
  // Klik tombol di dalam menu (mis. logoutBtn) sudah punya handler-nya
  // sendiri dan menutup menu lewat switchModuleAll/logout — jangan
  // toggle ulang di sini kalau yang diklik memang salah satu isinya,
  // supaya tidak langsung terbuka lagi sepersekian detik kemudian.
  if (e.target.closest('#userMenu button')) return;
  const menu = $('#userMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenuBtn')) $('#userMenu').style.display = 'none';
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#userMenu').style.display = 'none'; });

/* ---------------------------------------------------------------- drawer generik */
let auxKind = null; // 'case' | 'project' | 'pendampingan'
// saveLabel opsional — dipakai drawer View Profil Perusahaan supaya
// tombol utamanya bertuliskan "Edit Profil" (mengarah ke drawer edit),
// bukan "Simpan" (tidak ada yang disimpan di layar view). SELALU di-set
// ulang di sini (bukan dibiarkan dari drawer sebelumnya) supaya label
// tidak pernah nyangkut salah — default tetap t('common.save') seperti
// sebelumnya untuk semua pemanggil lain yang tidak mengirim argumen ini.
function bukaAuxDrawer(kind, judul, bodyHtml, onSave, saveLabel) {
  auxKind = kind;
  $('#auxDTitle').textContent = judul;
  $('#auxDBody').innerHTML = bodyHtml;
  $('#auxDSave').onclick = onSave;
  $('#auxDSave').textContent = saveLabel || t('common.save');
  $('#veil').classList.add('on'); $('#auxDrawer').classList.add('on');
}
function tutupAuxDrawer() {
  auxKind = null;
  $('#veil').classList.remove('on'); $('#auxDrawer').classList.remove('on');
}
$('#auxDClose').onclick = tutupAuxDrawer; $('#auxDCancel').onclick = tutupAuxDrawer;

const TAHAP_NAMA = nameProxy('tahap', 'cases_tahap');
const PERAN_KLIEN_NAMA = nameProxy('peranKlien', 'cases_peran_klien');
const CASE_STATUS_NAMA = nameProxy('caseStatus', 'cases_status_siklus');

/* ================================================================
   MODUL LITIGASI & SIDANG
   ================================================================ */
const CS = { rows: [], ref: null, dashboard: null, loaded: false, editing: null };

async function muatCasesSemua() {
  showApiErr('');
  try {
    const [ref, list, dash] = await Promise.all([
      Api.casesReference(S.ws.client_org_id), Api.cases(S.ws.client_org_id), Api.casesDashboard(S.ws.client_org_id),
    ]);
    CS.ref = ref; CS.rows = list.rows; CS.dashboard = dash.dashboard; CS.loaded = true;
    renderCaseCards(); renderCaseTable();
  } catch (err) { showApiErr(err.message || t('cases.loadError')); }
}
function renderCaseCards() {
  const d = CS.dashboard || {};
  $('#caseCards').innerHTML = [
    statCard(t('cases.card.aktif'), d.perkara_aktif ?? 0, 'acc-info', t('cases.card.aktif.note'), 'scale'),
    statCard(t('cases.card.sidangHariIni'), d.sidang_hari_ini ?? 0, 'acc-warn', t('cases.card.sidangHariIni.note'), 'cal'),
    statCard(t('cases.card.sidang7hari'), d.sidang_7_hari ?? 0, 'acc-warn', t('cases.card.sidang7hari.note'), 'clock'),
    statCard(t('cases.card.tahapTinggi'), d.tahap_tertinggi ?? 0, 'acc-repl', t('cases.card.tahapTinggi.note'), 'gavel'),
  ].join('');

  const donut = $('#caseDonut');
  if (donut) {
    // Sebaran tahap dihitung dari baris yang sedang dimuat — bukan kolom tersimpan.
    const palette = [CHART_COLORS.info, CHART_COLORS.repl, CHART_COLORS.warn, CHART_COLORS.ok,
                     CHART_COLORS.teal, CHART_COLORS.gold, CHART_COLORS.crit, CHART_COLORS.idle];
    const hitung = {};
    CS.rows.forEach((c) => { hitung[c.tahap] = (hitung[c.tahap] || 0) + 1; });
    const segs = Object.keys(hitung).map((k, i) => ({
      label: TAHAP_NAMA[k] || k, value: hitung[k], color: palette[i % palette.length],
    }));
    donut.innerHTML = donutHTML(segs, CS.rows.length, t('cases.card.aktif'));
  }
}
function renderCaseTable() {
  $('#caseEmpty').style.display = CS.rows.length ? 'none' : 'block';
  $('#caseBody').innerHTML = CS.rows.map((c, i) => {
    const pic = CS.ref?.pic.find((x) => x.id === c.pic_legal_id);
    const sidang = c.sidang_terdekat_tanggal
      ? `${esc(tglTampil(c.sidang_terdekat_tanggal))}${c.hari_ke_sidang != null ? ` <span class="days ${c.hari_ke_sidang <= 7 ? 'soon' : ''}">(${t('common.daysLeft', { n: c.hari_ke_sidang })})</span>` : ''}`
      : `<span style="color:var(--muted-2)">${esc(t('cases.belumDijadwalkan'))}</span>`;
    return `<tr data-id="${c.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(c.nomor_perkara)}</div>${c.lawan_pihak_teks ? `<div class="sub">vs ${esc(c.lawan_pihak_teks)}</div>` : ''}</td>
      <td>${esc(c.jenis_perkara || '—')}${c.peran_klien ? `<div class="sub">${esc(PERAN_KLIEN_NAMA[c.peran_klien] || c.peran_klien)}</div>` : ''}</td>
      <td>${esc(c.pengadilan || '—')}</td>
      <td><span class="tag">${esc(TAHAP_NAMA[c.tahap] || c.tahap)}</span></td>
      <td>${sidang}</td>
      <td><span class="pill ${c.status_siklus === 'aktif' ? 'p-aman' : 'p-tidak_dipantau'}">${esc(CASE_STATUS_NAMA[c.status_siklus] || c.status_siklus)}</span></td>
      <td>${whoMini(pic?.nama, pic?.jabatan ? JABATAN_NAMA[pic.jabatan] : null)}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#caseBody tr[data-id]').forEach((tr) => {
    tr.onclick = () => bukaCaseDrawer(tr.dataset.id);
  });
}
function caseFormHTML(row, hearings, minutes) {
  const r = CS.ref;
  return `
  <div class="grid2">
    <div class="f"><label>${t('cases.f.nomor')} <span class="req">*</span></label>
      <input id="cs_nomor" value="${esc(row?.nomor_perkara || '')}"></div>
    <div class="f"><label>${t('cases.f.pengadilan')}</label><input id="cs_pengadilan" value="${esc(row?.pengadilan || '')}"></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.jenis')}</label>
    <input id="cs_jenis" placeholder="${esc(t('cases.f.jenisPh'))}" value="${esc(row?.jenis_perkara || '')}"></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('cases.f.peran')}</label>
      <select id="cs_peran">${opsi(r.peranKlien.map((v) => ({ v, l: PERAN_KLIEN_NAMA[v] })), row?.peran_klien, t('common.none'))}</select></div>
    <div class="f"><label>${t('cases.f.tahap')}</label>
      <select id="cs_tahap">${opsi(r.tahap.map((v) => ({ v, l: TAHAP_NAMA[v] })), row?.tahap || 'pendaftaran', t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.lawan')}</label>
    <input id="cs_lawan" value="${esc(row?.lawan_pihak_teks || '')}"></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('cases.f.tglDaftar')}</label><input type="date" id="cs_tgldaftar" value="${esc(row?.tanggal_daftar ? row.tanggal_daftar.slice(0,10) : '')}"></div>
    <div class="f"><label>${t('cases.f.pic')}</label><select id="cs_pic">${opsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), row?.pic_legal_id, t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.status')}</label>
    <select id="cs_status">${opsi(r.statusSiklus.map((v) => ({ v, l: CASE_STATUS_NAMA[v] || v })), row?.status_siklus || 'aktif', t('common.none'))}</select></div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.keterangan')}</label><textarea id="cs_ket" rows="2">${esc(row?.keterangan || '')}</textarea></div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="lampiran_perkara"></div>
  </div>
  ${row ? `
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('cases.hearingTitle')}</h4>
    <div id="hearingList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
      ${hearings.map((h) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8fafc;border-radius:8px;font-size:12px">
        <span><b>${esc(tglTampil(h.tanggal_sidang))}</b> ${h.jam_sidang ? esc(h.jam_sidang.slice(0,5)) : ''} — ${esc(h.agenda || '')}</span>
        <span class="tag">${esc(h.status)}</span></div>`).join('') || `<p style="font-size:12px;color:var(--muted);margin:0">${esc(t('cases.hearingEmpty'))}</p>`}
    </div>
    <div class="grid2">
      <div class="f"><label>${t('cases.f.tanggal')}</label><input type="date" id="cs_h_tgl"></div>
      <div class="f"><label>${t('cases.f.jam')}</label><input type="time" id="cs_h_jam"></div>
    </div>
    <div class="f" style="margin-top:8px"><input id="cs_h_agenda" placeholder="${esc(t('cases.f.agendaPh'))}"></div>
    <button class="btn ghost" id="cs_h_add" type="button" style="margin-top:8px">${t('cases.addHearing')}</button>
  </div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('cases.minutesTitle')}</h4>
    <div id="minuteList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
      ${minutes.map((m) => `<div style="padding:8px 10px;background:#f8fafc;border-radius:8px;font-size:12px">
        <div class="sub" style="margin-bottom:3px">${esc(tglTampil(m.created_at.slice(0,10)))} · ${esc(m.dicatat_oleh_nama || '—')} · ${esc(m.status)}</div>
        ${esc(m.isi)}</div>`).join('') || `<p style="font-size:12px;color:var(--muted);margin:0">${esc(t('cases.minutesEmpty'))}</p>`}
    </div>
    <textarea id="cs_m_isi" rows="2" placeholder="${esc(t('cases.minutePh'))}"></textarea>
    <button class="btn ghost" id="cs_m_add" type="button" style="margin-top:8px">${t('cases.addMinute')}</button>
  </div>` : ''}`;
}
async function bukaCaseDrawer(id) {
  CS.editing = id;
  let row = null, hearings = [], minutes = [];
  if (id) { const r = await Api.getCase(id); row = r.row; hearings = r.hearings; minutes = r.minutes; }
  bukaAuxDrawer('case', id ? t('cases.drawerTitle') : t('cases.drawerTitleNew'), caseFormHTML(row, hearings, minutes), simpanCase);
  renderLampiranPanel('lampiran_perkara', 'case', id, { clientOrgId: S.ws.client_org_id });
  if (id) {
    $('#cs_h_add').onclick = async () => {
      const tgl = $('#cs_h_tgl').value, jam = $('#cs_h_jam').value, agenda = $('#cs_h_agenda').value;
      if (!tgl) return toast(t('cases.err.tglSidang'), 'warning');
      try { await Api.addHearing(id, { tanggalSidang: tgl, jamSidang: jam || null, agenda: agenda || null });
        toast(t('cases.hearingAdded'), 'success'); await bukaCaseDrawer(id); await muatCasesSemua();
      } catch (e) { toast(e.message, 'error'); }
    };
    $('#cs_m_add').onclick = async () => {
      const isi = $('#cs_m_isi').value.trim();
      if (!isi) return toast(t('cases.err.isiCatatan'), 'warning');
      try { await Api.addMinute(id, { isi, status: 'final' });
        toast(t('cases.minuteAdded'), 'success'); await bukaCaseDrawer(id);
      } catch (e) { toast(e.message, 'error'); }
    };
  }
}
async function simpanCase() {
  const body = {
    nomorPerkara: $('#cs_nomor').value.trim(), pengadilan: $('#cs_pengadilan').value.trim() || null,
    jenisPerkara: $('#cs_jenis').value.trim() || null, peranKlien: $('#cs_peran').value || null,
    tahap: $('#cs_tahap').value, lawanPihakTeks: $('#cs_lawan').value.trim() || null,
    tanggalDaftar: $('#cs_tgldaftar').value || null, picLegalId: $('#cs_pic').value || null,
    statusSiklus: $('#cs_status').value, keterangan: $('#cs_ket').value.trim() || null,
  };
  if (!body.nomorPerkara) return toast(t('cases.err.nomor'), 'warning');
  try {
    if (CS.editing) await Api.updateCase(CS.editing, body);
    else await Api.createCase({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatCasesSemua(); toast(t('common.saved'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}
$('#addCaseBtn').onclick = () => bukaCaseDrawer(null);

/* ================================================================
   MODUL PROYEK LEGAL
   ================================================================ */
const PJ = { rows: [], ref: null, dashboard: null, loaded: false, editing: null };
const PROJECT_STATUS_NAMA = nameProxy('projStatus', 'legal_projects_status');
const PROJECT_SW_NAMA = nameProxy('projSW');

async function muatProjectsSemua() {
  showApiErr('');
  try {
    const [ref, list, dash] = await Promise.all([
      Api.projectsReference(S.ws.client_org_id), Api.projects(S.ws.client_org_id), Api.projectsDashboard(S.ws.client_org_id),
    ]);
    PJ.ref = ref; PJ.rows = list.rows; PJ.dashboard = dash.dashboard; PJ.loaded = true;
    renderProjectCards(); renderProjectTable();
  } catch (err) { showApiErr(err.message || t('projects.loadError')); }
}
function renderProjectCards() {
  const d = PJ.dashboard || {};
  $('#projectCards').innerHTML = [
    statCard(t('projects.card.total'), d.total_proyek ?? 0, 'acc-info', t('projects.card.total.note'), 'folder'),
    statCard(t('projects.card.berjalan'), d.berjalan ?? 0, 'acc-ok', t('projects.card.berjalan.note'), 'play'),
    statCard(t('projects.card.segeraSelesai'), d.segera_selesai ?? 0, 'acc-warn', t('projects.card.segeraSelesai.note'), 'flag'),
    statCard(t('projects.card.terlambat'), d.terlambat ?? 0, 'acc-crit', t('projects.card.terlambat.note'), 'alert'),
    statCard(t('projects.card.selesai'), d.selesai ?? 0, '', t('projects.card.selesai.note'), 'check'),
  ].join('');

  const donut = $('#projectDonut');
  if (donut) {
    donut.innerHTML = donutHTML([
      { label: t('projStatus.selesai'),      value: d.selesai ?? 0,        color: CHART_COLORS.ok },
      { label: t('projStatus.berjalan'),     value: d.berjalan ?? 0,       color: CHART_COLORS.info },
      { label: t('projStatus.tertunda'),     value: d.tertunda ?? 0,       color: CHART_COLORS.warn },
      { label: t('projSW.segera_selesai'),   value: d.segera_selesai ?? 0, color: CHART_COLORS.gold },
    ], d.total_proyek ?? 0, t('projects.card.total'));
  }

  const bars = $('#projectBars');
  if (bars) {
    const palette = [CHART_COLORS.ok, CHART_COLORS.repl, CHART_COLORS.warn, CHART_COLORS.info,
                     CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.idle];
    const hitung = {};
    PJ.rows.forEach((p) => { const k = p.kategori || t('common.noneParent'); hitung[k] = (hitung[k] || 0) + 1; });
    bars.innerHTML = hbarsHTML(Object.keys(hitung).map((k, i) => ({
      label: k, value: hitung[k], color: palette[i % palette.length],
    })));
  }
}
function renderProjectTable() {
  $('#projectEmpty').style.display = PJ.rows.length ? 'none' : 'block';
  $('#projectBody').innerHTML = PJ.rows.map((p, i) => {
    const pic = PJ.ref?.pic.find((x) => x.id === p.pic_legal_id);
    const d = p.sisa_hari;
    const sisa = (p.status_waktu === 'tanpa_batas' || d == null) ? '—'
      : `<span class="days ${d < 0 ? 'neg' : d <= 7 ? 'soon' : ''}">${sisaTeks(d)}</span>`;
    return `<tr data-id="${p.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(p.nama_proyek)}</div></td>
      <td>${p.kategori ? `<span class="tag">${esc(p.kategori)}</span>` : '—'}</td>
      <td>${progHTML(p.progress_persen, p.status === 'selesai' ? 'done' : p.status_waktu === 'terlambat' ? 'late' : '')}</td>
      <td>${p.target_selesai ? esc(tglTampil(p.target_selesai)) : '—'}</td>
      <td>${sisa}</td>
      <td><span class="pill p-${p.status_waktu === 'terlambat' ? 'kritis' : p.status_waktu === 'segera_selesai' ? 'peringatan' : p.status === 'selesai' ? 'aman' : 'pantau'}">${esc(PROJECT_SW_NAMA[p.status_waktu] || PROJECT_STATUS_NAMA[p.status])}</span></td>
      <td>${whoMini(pic?.nama, pic?.jabatan ? JABATAN_NAMA[pic.jabatan] : null)}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#projectBody tr[data-id]').forEach((tr) => {
    tr.onclick = () => bukaProjectDrawer(PJ.rows.find((p) => p.id === tr.dataset.id));
  });
}
function projectFormHTML(row) {
  const r = PJ.ref;
  return `
  <div class="f"><label>${t('projects.f.nama')} <span class="req">*</span></label><input id="pj_nama" value="${esc(row?.nama_proyek || '')}"></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('projects.f.kategori')}</label><input id="pj_kategori" placeholder="${esc(t('projects.f.kategoriPh'))}" value="${esc(row?.kategori || '')}"></div>
    <div class="f"><label>${t('projects.f.pic')}</label><select id="pj_pic">${opsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), row?.pic_legal_id, t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('projects.f.progress')}<span id="pj_progress_val">${row?.progress_persen ?? 0}</span>%</label>
    <input type="range" id="pj_progress" min="0" max="100" step="5" value="${row?.progress_persen ?? 0}"></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('projects.f.target')}</label><input type="date" id="pj_target" value="${esc(row?.target_selesai ? row.target_selesai.slice(0,10) : '')}"></div>
    <div class="f"><label>${t('projects.f.status')}</label><select id="pj_status">${opsi(r.status.map((v) => ({ v, l: PROJECT_STATUS_NAMA[v] })), row?.status || 'berjalan', t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('projects.f.keterangan')}</label><textarea id="pj_ket" rows="3">${esc(row?.keterangan || '')}</textarea></div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="lampiran_proyek"></div>
  </div>`;
}
async function bukaProjectDrawer(row) {
  PJ.editing = row ? row.id : null;
  bukaAuxDrawer('project', row ? t('projects.drawerTitle') : t('projects.drawerTitleNew'), projectFormHTML(row), simpanProject);
  renderLampiranPanel('lampiran_proyek', 'project', row ? row.id : null, { clientOrgId: S.ws.client_org_id });
  const range = $('#pj_progress');
  if (range) range.addEventListener('input', () => { $('#pj_progress_val').textContent = range.value; });
}
async function simpanProject() {
  const body = {
    namaProyek: $('#pj_nama').value.trim(), kategori: $('#pj_kategori').value.trim() || null,
    picLegalId: $('#pj_pic').value || null, progressPersen: Number($('#pj_progress').value),
    targetSelesai: $('#pj_target').value || null, status: $('#pj_status').value,
    keterangan: $('#pj_ket').value.trim() || null,
  };
  if (!body.namaProyek) return toast(t('projects.err.nama'), 'warning');
  try {
    if (PJ.editing) await Api.updateProject(PJ.editing, body);
    else await Api.createProject({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatProjectsSemua(); toast(t('common.saved'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}
$('#addProjectBtn').onclick = () => bukaProjectDrawer(null);

/* ================================================================
   MODUL HUB PENDAMPINGAN
   ================================================================ */
const PD = { rows: [], ref: null, loaded: false, editing: null };
const JENIS_PD_NAMA = nameProxy('jenisPd', 'pendampingan_jenis');
const STATUS_PD_NAMA = nameProxy('statusPd', 'pendampingan_status');

async function muatPendampinganSemua() {
  showApiErr('');
  try {
    const [ref, list] = await Promise.all([Api.pendampinganReference(S.ws.client_org_id), Api.pendampingan(S.ws.client_org_id)]);
    PD.ref = ref; PD.rows = list.rows; PD.loaded = true;
    renderPendampinganCards(); renderPendampinganTable();
    $('#waLink').href = 'https://wa.me/62800000000?text=' + encodeURIComponent(t('pendampingan.waText', { ws: S.ws.nama_singkat }));
  } catch (err) { showApiErr(err.message || t('pendampingan.loadError')); }
}
function renderPendampinganCards() {
  const n = (s) => PD.rows.filter((r) => r.status === s).length;
  $('#pendampinganCards').innerHTML = [
    statCard(t('pendampingan.card.total'), PD.rows.length, 'acc-info', t('pendampingan.card.total.note'), 'inbox'),
    statCard(t('pendampingan.card.menunggu'), n('menunggu'), 'acc-warn', t('pendampingan.card.menunggu.note'), 'clock'),
    statCard(t('pendampingan.card.diproses'), n('diproses'), '', t('pendampingan.card.diproses.note'), 'play'),
    statCard(t('pendampingan.card.selesai'), n('selesai'), 'acc-ok', t('pendampingan.card.selesai.note'), 'check'),
  ].join('');
}
function renderPendampinganTable() {
  $('#pendampinganEmpty').style.display = PD.rows.length ? 'none' : 'block';
  $('#pendampinganBody').innerHTML = PD.rows.map((r, i) => `<tr data-id="${r.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><span class="tag">${esc(JENIS_PD_NAMA[r.jenis] || r.jenis)}</span></td>
      <td>${r.tanggal_kegiatan ? esc(tglTampil(r.tanggal_kegiatan)) : '—'}</td>
      <td>${esc(r.lokasi || '—')}</td>
      <td>${esc(r.pihak_terlibat || '—')}</td>
      <td><span class="pill ${r.status === 'selesai' ? 'p-aman' : r.status === 'menunggu' ? 'p-peringatan' : r.status === 'dibatalkan' ? 'p-tidak_dipantau' : 'p-pantau'}">${esc(STATUS_PD_NAMA[r.status])}</span></td>
      <td>${whoMini(r.pic_nama, r.pic_jabatan ? JABATAN_NAMA[r.pic_jabatan] : null)}</td>
    </tr>`).join('');
  document.querySelectorAll('#pendampinganBody tr[data-id]').forEach((tr) => {
    tr.onclick = () => bukaPendampinganDrawer(PD.rows.find((r) => r.id === tr.dataset.id));
  });
}
function pendampinganFormHTML(row) {
  const r = PD.ref;
  return `
  <div class="grid2">
    <div class="f"><label>${t('pendampingan.f.jenis')} <span class="req">*</span></label>
      <select id="pd_jenis">${opsi(r.jenis.map((v) => ({ v, l: JENIS_PD_NAMA[v] })), row?.jenis, t('common.none'))}</select></div>
    <div class="f"><label>${t('pendampingan.f.tanggal')}</label><input type="date" id="pd_tanggal" value="${esc(row?.tanggal_kegiatan ? row.tanggal_kegiatan.slice(0,10) : '')}"></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('pendampingan.f.lokasi')}</label><input id="pd_lokasi" value="${esc(row?.lokasi || '')}"></div>
  <div class="f" style="margin-top:12px"><label>${t('pendampingan.f.pihak')}</label><input id="pd_pihak" value="${esc(row?.pihak_terlibat || '')}"></div>
  <div class="f" style="margin-top:12px"><label>${t('pendampingan.f.deskripsi')}</label><textarea id="pd_deskripsi" rows="3">${esc(row?.deskripsi || '')}</textarea></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('pendampingan.f.status')}</label><select id="pd_status">${opsi(r.status.map((v) => ({ v, l: STATUS_PD_NAMA[v] })), row?.status || 'menunggu', t('common.none'))}</select></div>
    <div class="f"><label>${t('pendampingan.f.pic')}</label><select id="pd_pic">${opsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), row?.pic_id, t('common.none'))}</select></div>
  </div>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="lampiran_pendampingan"></div>
  </div>`;
}
async function bukaPendampinganDrawer(row) {
  PD.editing = row ? row.id : null;
  bukaAuxDrawer('pendampingan', row ? t('pendampingan.drawerTitle') : t('pendampingan.drawerTitleNew'), pendampinganFormHTML(row), simpanPendampingan);
  renderLampiranPanel('lampiran_pendampingan', 'pendampingan', row ? row.id : null, { clientOrgId: S.ws.client_org_id });
}
async function simpanPendampingan() {
  const body = {
    jenis: $('#pd_jenis').value, tanggalKegiatan: $('#pd_tanggal').value || null,
    lokasi: $('#pd_lokasi').value.trim() || null, pihakTerlibat: $('#pd_pihak').value.trim() || null,
    deskripsi: $('#pd_deskripsi').value.trim() || null, status: $('#pd_status').value,
    picId: $('#pd_pic').value || null,
  };
  if (!body.jenis) return toast(t('pendampingan.err.jenis'), 'warning');
  try {
    if (PD.editing) await Api.updatePendampingan(PD.editing, body);
    else await Api.createPendampingan({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatPendampinganSemua(); toast(t('common.saved'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}
$('#addPendampinganBtn').onclick = () => bukaPendampinganDrawer(null);

/* ================================================================
   MODUL ARSIP DOKUMEN
   ================================================================ */
const DC = { rows: [], loaded: false };
function fmtUkuran(bytes) {
  bytes = Number(bytes);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
async function muatDocsSemua() {
  showApiErr('');
  try {
    const list = await Api.documents(S.ws.client_org_id);
    DC.rows = list.rows; DC.loaded = true;
    renderDocCards(); renderDocTable();
  } catch (err) { showApiErr(err.message || t('docs.loadError')); }
}
function renderDocCards() {
  const totalBytes = DC.rows.reduce((s, d) => s + Number(d.ukuran_byte || 0), 0);
  $('#docCards').innerHTML = [
    statCard(t('docs.card.total'), DC.rows.length, 'acc-info', t('docs.card.total.note'), 'archive'),
    statCard(t('docs.card.ukuran'), fmtUkuran(totalBytes), '', t('docs.card.ukuran.note'), 'disk'),
  ].join('');
}
function renderDocTable() {
  $('#docEmpty').style.display = DC.rows.length ? 'none' : 'block';
  $('#docBody').innerHTML = DC.rows.map((d, i) => `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(d.nama_file)}</div></td>
      <td>${d.kategori_arsip ? `<span class="tag">${esc(d.kategori_arsip)}</span>` : '—'}</td>
      <td>${fmtUkuran(d.ukuran_byte)}</td>
      <td>${esc(tglTampil(d.uploaded_at.slice(0,10)))}</td>
      <td>${esc(d.uploaded_by_nama || '—')}</td>
      <td>
        <button class="btn ghost" data-preview="${d.id}" data-mime="${esc(d.mime_type || '')}" data-fn="${esc(d.nama_file)}" style="padding:5px 8px;font-size:11px">${t('docs.preview')}</button>
        <button class="btn ghost" data-dl="${d.id}" data-fn="${esc(d.nama_file)}" style="padding:5px 8px;font-size:11px">${t('docs.download')}</button>
      </td>
    </tr>`).join('');
  document.querySelectorAll('#docBody button[data-dl]').forEach((btn) => {
    btn.onclick = async () => {
      try { await Api.downloadDocument(btn.dataset.dl, btn.dataset.fn); }
      catch (e) { toast(e.message || t('docs.downloadFail'), 'error'); }
    };
  });
  document.querySelectorAll('#docBody button[data-preview]').forEach((btn) => {
    btn.onclick = () => bukaPreviewDokumen(btn.dataset.preview, btn.dataset.mime, btn.dataset.fn);
  });
}
$('#docUploadBtn').onclick = async () => {
  const fileEl = $('#docFile'), hint = $('#docUploadHint');
  if (!fileEl.files.length) { hint.textContent = t('docs.uploadHint.pilih'); return; }
  const fd = new FormData();
  fd.append('file', fileEl.files[0]);
  fd.append('clientOrgId', S.ws.client_org_id);
  fd.append('kategoriArsip', $('#docKategori').value);
  hint.textContent = t('docs.uploadHint.progress');
  try {
    await Api.uploadDocument(fd);
    fileEl.value = ''; hint.textContent = '';
    await muatDocsSemua(); toast(t('docs.uploaded'), 'success');
  } catch (e) { hint.textContent = e.message || t('docs.uploadHint.fail'); }
};

/* ================================================================
   DASHBOARD RINGKAS — menyatukan angka utama keenam modul
   Memakai endpoint dashboard yang sudah ada, tidak menambah query baru.
   ================================================================ */
const DS = { loaded: false, data: null };

async function muatDashboardRingkas() {
  if (DS.loaded) { gambarDashboard(); return; }
  showApiErr('');
  try {
    const org = S.ws.client_org_id;
    if (org) muatProfilPerusahaan(org); // tidak diawait — panel ini independen dari kartu ringkasan
    // Ditoleransi sebagian gagal: satu modul bermasalah tidak mengosongkan
    // seluruh dashboard — kartunya saja yang tampil "—".
    const hasil = await Promise.allSettled([
      Api.dashboard(org), Api.permitsDashboard(org),
      Api.casesDashboard(org), Api.projectsDashboard(org),
      Api.casesTahapSummary(org), Api.permitsStatusSummary(org),
    ]);
    const ambil = (i, k) => hasil[i].status === 'fulfilled' ? hasil[i].value[k] : null;
    DS.data = {
      kontrak: ambil(0, 'dashboard'), izin: ambil(1, 'dashboard'),
      perkara: ambil(2, 'dashboard'), proyek: ambil(3, 'dashboard'),
      tahapCases: ambil(4, 'tahapan') || [], statusPermits: ambil(5, 'statusSiklus') || [],
    };
    DS.loaded = true;
    gambarDashboard();
  } catch (err) { showApiErr(err.message || t('kontrak.loadError')); }
}

function gambarDashboard() {
  const d = DS.data || {};
  const n = (o, k) => (o && o[k] != null ? o[k] : '—');
  $('#dashCards').innerHTML = [
    statCard(t('dashboard.card.kontrak'), n(d.kontrak, 'kontrak_aktif'), 'acc-info',
      t('dashboard.card.kontrak.note'), 'file'),
    statCard(t('dashboard.card.izin'), n(d.izin, 'izin_aktif'), 'acc-ok',
      t('dashboard.card.izin.note'), 'shield'),
    statCard(t('dashboard.card.perkara'), n(d.perkara, 'perkara_aktif'), 'acc-repl',
      t('dashboard.card.perkara.note'), 'scale'),
    statCard(t('dashboard.card.proyek'), n(d.proyek, 'berjalan'), 'acc-warn',
      t('dashboard.card.proyek.note'), 'folder'),
  ].join('');

  // Tiga panel pintasan: yang butuh perhatian lebih dulu.
  const perluPerhatian = [
    { k: t('dashboard.attn.kontrakExp'), v: n(d.kontrak, 'akan_berakhir_90h'), mod: 'kontrak',  ic: 'clock',  cls: 'warn' },
    { k: t('dashboard.attn.kontrakLate'), v: n(d.kontrak, 'kedaluwarsa'),      mod: 'kontrak',  ic: 'alert',  cls: 'crit' },
    { k: t('dashboard.attn.izinExp'),    v: n(d.izin, 'akan_berakhir'),        mod: 'permits',  ic: 'clock',  cls: 'warn' },
    { k: t('dashboard.attn.izinGap'),    v: n(d.izin, 'gap_wajib'),            mod: 'permits',  ic: 'gap',    cls: 'crit' },
    { k: t('dashboard.attn.sidang'),     v: n(d.perkara, 'sidang_7_hari'),     mod: 'cases',    ic: 'cal',    cls: 'info' },
    { k: t('dashboard.attn.proyekLate'), v: n(d.proyek, 'terlambat'),          mod: 'projects', ic: 'alert',  cls: 'crit' },
  ];
  const feed = perluPerhatian.map((r) => `<button class="it" data-go="${r.mod}" style="width:100%;text-align:left">
      <span class="ic ${r.cls}">${ico(r.ic)}</span>
      <span class="tx"><b>${esc(r.k)}</b></span>
      <span class="when" style="font-size:15px;font-weight:600;color:var(--ink)">${r.v}</span>
    </button>`).join('');

  $('#dashPanels').innerHTML = `
    <div class="panel" style="grid-column:span 2">
      <div class="panelhead"><div class="ttl2">
        <h3>${esc(t('dashboard.attnTitle'))}</h3>
        <p>${esc(t('dashboard.attnDesc'))}</p>
      </div></div>
      <div class="feed">${feed}</div>
    </div>
    <div class="panel">
      <div class="panelhead"><div class="ttl2"><h3>${esc(t('dashboard.stepperTitle'))}</h3></div></div>
      <div style="padding:14px 18px 18px" id="dashStepper"></div>
    </div>`;

  document.querySelectorAll('#dashPanels [data-go]').forEach((b) => {
    b.onclick = () => switchModuleAll(b.dataset.go);
  });
  renderStepperWidget();
}

/* ================================================================
   STEPPER DASHBOARD — pipeline Tahapan Litigasi / Status Perizinan,
   pengganti panel "Buka Modul" (tautan datar tanpa data). Data
   hitungannya sudah ikut dimuat bareng DS.data (muatDashboardRingkas)
   supaya cuma satu putaran fetch; STEPPER di sini cuma state TAMPILAN
   (toggle modul mana yang dilihat, tahap mana yang sedang dibuka, dan
   cache daftar perkara/izin — dimuat SEKALI SAJA saat pertama kali
   sebuah tahap diklik, bukan di depan, supaya tidak menarik seluruh
   daftar perkara/izin kalau penggunanya tidak pernah membuka detailnya).
   Murni CSS untuk animasinya (lihat style.css) — bukan library luar.
   ================================================================ */
const STEPPER = { modul: 'cases', terbuka: null, casesItems: null, permitsItems: null };

function renderStepperWidget() {
  const el = $('#dashStepper');
  if (!el) return;
  const data = STEPPER.modul === 'cases' ? (DS.data.tahapCases || []) : (DS.data.statusPermits || []);
  const namaProxy = STEPPER.modul === 'cases' ? TAHAP_NAMA : PERMIT_STATUS_NAMA;

  el.innerHTML = `
    <div class="seg" style="margin-bottom:16px">
      <button class="${STEPPER.modul === 'cases' ? 'on' : ''}" data-modul="cases" type="button">${esc(t('dashboard.stepper.litigasi'))}</button>
      <button class="${STEPPER.modul === 'permits' ? 'on' : ''}" data-modul="permits" type="button">${esc(t('dashboard.stepper.perizinan'))}</button>
    </div>
    <div class="stepper">
      ${data.map((s, i) => {
        const terbuka = STEPPER.terbuka === s.kode;
        return `<div class="stage ${s.jumlah > 0 ? 'ada' : ''} ${terbuka ? 'on' : ''}" data-kode="${esc(s.kode)}" style="animation-delay:${i * 55}ms">
          <div class="dot">${s.jumlah}</div>
          <div class="lbl"><b>${esc(namaProxy[s.kode])}</b>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
          </div>
          <div class="detail"><div class="detail-inner">${terbuka ? stepperDetailHTML(s.kode) : ''}</div></div>
        </div>`;
      }).join('') || `<p class="hint">${esc(t('dashboard.stepper.kosong'))}</p>`}
    </div>`;

  // Garis penghubung dianimasikan MASUK sesudah render (bukan langsung
  // saat innerHTML dipasang) — kalau ".shown" ikut ada di HTML awal,
  // browser tidak pernah melihat transisi dari 0 (state awal sudah
  // "penuh" sebelum sempat dirender), jadi tidak ada yang teranimasi.
  requestAnimationFrame(() => {
    document.querySelectorAll('#dashStepper .stage').forEach((elStep) => elStep.classList.add('shown'));
  });

  document.querySelectorAll('#dashStepper [data-modul]').forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      STEPPER.modul = b.dataset.modul; STEPPER.terbuka = null;
      renderStepperWidget();
    };
  });
  document.querySelectorAll('#dashStepper .stage').forEach((elStep) => {
    elStep.onclick = () => bukaTutupStepperTahap(elStep.dataset.kode);
  });
  document.querySelectorAll('#dashStepper [data-stepgo]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); switchModuleAll(b.dataset.stepgo); };
  });
}

async function bukaTutupStepperTahap(kode) {
  if (STEPPER.terbuka === kode) { STEPPER.terbuka = null; renderStepperWidget(); return; }
  STEPPER.terbuka = kode;
  renderStepperWidget(); // tampil dulu (skeleton "Memuat…"), baru menyusul isinya
  const org = S.ws.client_org_id;
  try {
    if (STEPPER.modul === 'cases' && !STEPPER.casesItems) STEPPER.casesItems = (await Api.cases(org)).rows;
    if (STEPPER.modul === 'permits' && !STEPPER.permitsItems) STEPPER.permitsItems = (await Api.permits(org)).rows;
  } catch (e) { /* non-fatal: detail tetap kosong, angka di lingkaran tetap benar */ }
  if (STEPPER.terbuka === kode) renderStepperWidget();
}

function stepperDetailHTML(kode) {
  if (STEPPER.modul === 'cases') {
    if (!STEPPER.casesItems) return `<div class="detail-item">${esc(t('common.loading'))}</div>`;
    const items = STEPPER.casesItems.filter((c) => c.tahap === kode);
    if (!items.length) return `<div class="detail-item" style="color:var(--muted-2)">${esc(t('dashboard.stepper.tahapKosong'))}</div>`;
    return items.map((c) => `<button class="detail-item" type="button" data-stepgo="cases">
      <b style="font-family:var(--mono);font-weight:600">${esc(c.nomor_perkara)}</b>${c.lawan_pihak_teks ? ' — ' + esc(c.lawan_pihak_teks) : ''}
    </button>`).join('');
  }
  if (!STEPPER.permitsItems) return `<div class="detail-item">${esc(t('common.loading'))}</div>`;
  const items = STEPPER.permitsItems.filter((p) => p.status_siklus === kode);
  if (!items.length) return `<div class="detail-item" style="color:var(--muted-2)">${esc(t('dashboard.stepper.tahapKosong'))}</div>`;
  return items.map((p) => `<button class="detail-item" type="button" data-stepgo="permits">
    ${esc(p.nama_izin)}${p.nomor_izin ? ' · ' + esc(p.nomor_izin) : ''}
  </button>`).join('');
}

/* ---------------------------------------------------------------------
   PROFIL PERUSAHAAN — panel di atas Dashboard. Bisa diedit Managing
   Partner/Admin Staf MIKK ATAU admin_klien organisasi itu sendiri
   (app.boleh_edit_klien(), db/18_client_orgs_edit_klien.sql) — peran
   lain (PIC/staf biasa, legal_manager/viewer) hanya melihat. Tombol
   Edit muncul/tidak berdasarkan `boleh_edit` dari API, bukan ditebak
   dari peran workspace — itu cuma menghindari menawarkan tombol yang
   memang akan ditolak RLS, bukan pemeriksaan hak akses yang sesungguhnya.
   ------------------------------------------------------------------- */
const KP_PROFIL = { row: null, mode: 'view' };
async function muatProfilPerusahaan(orgId) {
  try {
    const { row } = await Api.getClientOrg(orgId);
    KP_PROFIL.row = row;
    renderProfilPerusahaan();
  } catch (e) { /* non-fatal: panel disembunyikan saja kalau gagal dimuat */ }
}
function renderProfilPerusahaan() {
  const r = KP_PROFIL.row;
  const panel = $('#companyProfilePanel');
  if (!r) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="panelhead">
      <div class="ttl2"><h3>${esc(r.nama_legal)}</h3><p>${esc(r.nama_singkat)} · ${esc(r.sektor_usaha || '—')}</p></div>
      <button class="btn ghost" id="viewProfilPerusahaanBtn">${esc(t('companyProfile.viewBtn'))}</button>
    </div>
    <div style="padding:16px 18px" class="grid2">
      <div><div class="hint">${esc(t('companyProfile.npwp'))}</div><div class="doc">${esc(r.npwp || '—')}</div></div>
      <div><div class="hint">${esc(t('companyProfile.nib'))}</div><div class="doc">${esc(r.nib || '—')}</div></div>
      <div style="grid-column:1 / -1"><div class="hint">${esc(t('companyProfile.alamat'))}</div><div>${esc(r.alamat || '—')}</div></div>
      <div style="grid-column:1 / -1"><div class="hint">${esc(t('companyProfile.kbli'))}</div><div>${(r.kbli || []).map((k) => `<span class="tag">${esc(k)}</span>`).join(' ') || '—'}</div></div>
    </div>`;
  // "Lihat Profil" selalu tampil (bukan cuma untuk yang boleh_edit) — ini
  // View, bukan Edit; siapa pun yang bisa melihat panel ringkas ini boleh
  // membuka detail lengkapnya (field kustom + dokumen). Tombol Edit di
  // dalam halaman View-lah yang digerbangi r.boleh_edit (lihat
  // renderCompanyProfilePage). Pindah ke HALAMAN PENUH lewat
  // switchModuleAll biasa — BUKAN drawer lagi (fieldnya kebanyakan untuk
  // drawer sempit, dan drawer-di-atas-drawer sempat bikin modal pratinjau
  // dokumen ketumpuk di belakangnya — dilaporkan langsung dari layar).
  $('#viewProfilPerusahaanBtn').onclick = () => switchModuleAll('companyprofile');
}

/* Satu baris field read-only di halaman View — otomatis melebar satu
   baris penuh kalau isinya panjang (bukan dipotong/didesak sempit di
   grid 2 kolom), supaya field kustom yang isinya bisa apa saja (nama
   field bebas ketik) tetap rapi tertata tanpa perlu diatur manual. */
function fieldRowRoHTML(label, value) {
  const panjang = String(value || '').length > 40;
  return `<div style="${panjang ? 'grid-column:1 / -1' : ''}">
    <div class="hint">${esc(label)}</div><div>${esc(value || '—')}</div>
  </div>`;
}

/* Halaman penuh Profil Perusahaan — dua "mode" di satu section
   (#secCompanyProfile), bukan dua halaman terpisah: KP_PROFIL.mode
   memutuskan blok #cpView atau #cpEdit yang ditampilkan. Dipanggil
   dari switchModuleAll('companyprofile') tiap kali dibuka. */
async function renderCompanyProfilePage() {
  const r = KP_PROFIL.row;
  if (!r) return;
  const editMode = KP_PROFIL.mode === 'edit';
  $('#cpView').style.display = editMode ? 'none' : 'block';
  $('#cpEdit').style.display = editMode ? 'block' : 'none';

  if (editMode) {
    $('#cp_namaLegal').value = r.nama_legal || '';
    $('#cp_npwp').value = r.npwp || '';
    $('#cp_nib').value = r.nib || '';
    $('#cp_sektor').value = r.sektor_usaha || '';
    $('#cp_alamat').value = r.alamat || '';
    $('#cp_kbli').value = (r.kbli || []).join(', ');
    renderCustomFieldsEditor(r.client_org_id);
    return;
  }

  $('#cpViewNamaLegal').textContent = r.nama_legal;
  $('#cpViewSubtitle').textContent = `${r.nama_singkat} · ${r.sektor_usaha || '—'}`;
  $('#cpViewFields').innerHTML = `
    ${fieldRowRoHTML(t('companyProfile.namaLegal'), r.nama_legal)}
    ${fieldRowRoHTML(t('companyProfile.sektorUsaha'), r.sektor_usaha)}
    ${fieldRowRoHTML(t('companyProfile.npwp'), r.npwp)}
    ${fieldRowRoHTML(t('companyProfile.nib'), r.nib)}
    ${fieldRowRoHTML(t('companyProfile.alamat'), r.alamat)}
    <div style="grid-column:1 / -1"><div class="hint">${esc(t('companyProfile.kbli'))}</div>
      <div>${(r.kbli || []).map((k) => `<span class="tag">${esc(k)}</span>`).join(' ') || '—'}</div></div>`;
  // Tombol Edit cuma tampil kalau boleh_edit (RLS yang sebenarnya
  // menegakkan, ini sekadar tidak menawarkan pintu yang memang terkunci).
  $('#cpEditBtn').style.display = r.boleh_edit ? 'inline-flex' : 'none';
  $('#cpEditBtn').onclick = () => { KP_PROFIL.mode = 'edit'; renderCompanyProfilePage(); };

  let customFields = [];
  try { customFields = (await Api.customFields(r.client_org_id)).rows; } catch (e) { /* non-fatal */ }
  $('#cpViewCustomWrap').style.display = customFields.length ? 'block' : 'none';
  $('#cpViewCustomFields').innerHTML = customFields.map((f) => fieldRowRoHTML(f.label, f.nilai)).join('');

  renderLampiranPanel('cpViewDocs', 'client_org', r.client_org_id, { clientOrgId: r.client_org_id });
}

$('#cpCancelBtn').onclick = () => { KP_PROFIL.mode = 'view'; renderCompanyProfilePage(); };
$('#cpSaveBtn').onclick = async () => {
  const r = KP_PROFIL.row;
  const btn = $('#cpSaveBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    await Api.updateClientOrg(r.client_org_id, {
      namaLegal: $('#cp_namaLegal').value.trim(),
      npwp: $('#cp_npwp').value.trim() || null,
      nib: $('#cp_nib').value.trim() || null,
      sektorUsaha: $('#cp_sektor').value.trim() || null,
      alamat: $('#cp_alamat').value.trim() || null,
      kbli: $('#cp_kbli').value.split(',').map((s) => s.trim()).filter(Boolean),
    });
    toast(t('common.saved'), 'success');
    KP_PROFIL.mode = 'view';
    await muatProfilPerusahaan(r.client_org_id);
    await renderCompanyProfilePage();
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
  finally { btn.disabled = false; btn.textContent = t('common.save'); }
};

/* Field kustom (db/22_client_org_custom_fields.sql) — per-baris simpan/
   hapus sendiri (pola yang sama dengan Master Data), BUKAN ikut disimpan
   lewat tombol "Simpan" utama drawer edit di atas — supaya menambah satu
   field tidak mengharuskan field lain (namaLegal, dst.) ikut terkirim
   ulang, dan sebaliknya. */
async function renderCustomFieldsEditor(orgId) {
  const wrap = $('#cp_customFieldsWrap');
  if (!wrap) return;
  let rows = [];
  try { rows = (await Api.customFields(orgId)).rows; } catch (e) { /* non-fatal */ }

  wrap.innerHTML = `
    <div class="tscroll"><table style="min-width:420px"><tbody>${
      rows.map((f) => `<tr data-id="${f.id}">
        <td><input class="fld cf_label" value="${esc(f.label)}" style="width:100%"></td>
        <td><input class="fld cf_nilai" value="${esc(f.nilai || '')}" style="width:100%"></td>
        <td><button class="btn ghost cf_simpan" type="button" style="padding:5px 10px;font-size:11px">${esc(t('common.save'))}</button></td>
        <td><button class="iconbtn cf_hapus" type="button" title="${esc(t('common.delete'))}">${ico('trash')}</button></td>
      </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted-2);padding:12px">${esc(t('companyProfile.customFieldsKosong'))}</td></tr>`
    }</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <input id="cf_new_label" placeholder="${esc(t('companyProfile.customFieldsLabelPlaceholder'))}" style="flex:1;min-width:140px" class="fld">
      <input id="cf_new_nilai" placeholder="${esc(t('companyProfile.customFieldsValuePlaceholder'))}" style="flex:1;min-width:140px" class="fld">
      <button class="btn ghost" type="button" id="cf_tambahBtn">${esc(t('companyProfile.customFieldsAddBtn'))}</button>
    </div>`;

  wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.querySelector('.cf_simpan').onclick = async () => {
      const label = tr.querySelector('.cf_label').value.trim();
      if (!label) return toast(t('companyProfile.customFieldsErrLabel'), 'warning');
      try {
        await Api.updateCustomField(tr.dataset.id, { label, nilai: tr.querySelector('.cf_nilai').value.trim() || null });
        toast(t('common.saved'), 'success');
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
    tr.querySelector('.cf_hapus').onclick = async () => {
      if (!(await confirmDialog(t('companyProfile.customFieldsHapusConfirm')))) return;
      try {
        await Api.deleteCustomField(tr.dataset.id);
        toast(t('common.deleted'), 'success');
        renderCustomFieldsEditor(orgId);
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
  });
  $('#cf_tambahBtn').onclick = async () => {
    const label = $('#cf_new_label').value.trim();
    if (!label) return toast(t('companyProfile.customFieldsErrLabel'), 'warning');
    try {
      await Api.createCustomField(orgId, { label, nilai: $('#cf_new_nilai').value.trim() || null });
      toast(t('common.saved'), 'success');
      renderCustomFieldsEditor(orgId);
    } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
  };
}

/* ---------------------------------------------------------------- bahasa */
$('#langId').onclick = () => setLang('id');
$('#langEn').onclick = () => setLang('en');
function tandaiBahasaAktif() {
  $('#langId').classList.toggle('on', LANG === 'id');
  $('#langEn').classList.toggle('on', LANG === 'en');
}

onLangChange(() => {
  tandaiBahasaAktif();
  applyStaticI18n();
  if (!S.ws) return;
  $('#sbLabel').textContent = t(S.ws.tipe === 'staf_firma' ? 'sidebar.lawyerLabel' : 'sidebar.portalLabel');
  $('#whoRole').textContent = PERAN_LABEL[S.ws.peran] || S.ws.peran;
  gambarKepalaHalaman();
  isiSelectReferensi();
  $('#fKat').value = S.kat; $('#fStat').value = S.stat;
  $('#fLengkap').innerHTML = `<option value="">${esc(t('kontrak.filter.allLengkap'))}</option>
    <option value="belum">${esc(t('kontrak.filter.belum'))}</option><option value="sudah">${esc(t('kontrak.filter.sudah'))}</option>`;
  $('#fLengkap').value = S.lengkap;
  $('#q').value = S.q;
  render();
  if (DS.loaded) gambarDashboard();
  if (P.loaded) { renderPermitCards(); renderPermitTable(); renderGap(); }
  if (CS.loaded) { renderCaseCards(); renderCaseTable(); }
  if (PJ.loaded) { renderProjectCards(); renderProjectTable(); }
  if (PD.loaded) { renderPendampinganCards(); renderPendampinganTable(); }
  if (DC.loaded) { renderDocCards(); renderDocTable(); }
  if (TM.loaded) renderTimTable();
  if (RT.loaded) renderTarifTable();
  if (MC.loaded) { renderMyCasesCards(); renderMyCasesTable(); renderKlienKhususPanel(); }
  if (PR.loaded) { renderProfilIdentitas(); renderProfilProjects(); renderProfilDocs(); }
  if (MD.loaded) renderMasterDataPage();
  if (KP_PROFIL.row) renderProfilPerusahaan();
});

/* ---------------------------------------------------------------- mulai */
(async () => {
  applyStaticI18n();
  tandaiBahasaAktif();
  if (Api.isLoggedIn()) {
    try {
      const { user } = await Api.me();
      await arahkanSetelahMasuk(user);
    } catch (e) { goLogin(); }
  } else {
    goLogin();
  }
})();

/* ================================================================
   MODUL TARIF LAYANAN
   Penetapan tarif adalah keputusan bisnis: PRD Bagian 4 menyebut
   Managing Partner sebagai satu-satunya yang boleh menetapkannya, dan
   RLS (kebijakan rates_tulis) yang benar-benar menegakkannya. Antarmuka
   ini hanya menyembunyikan tombol yang memang tidak akan berhasil.

   Mengubah tarif TIDAK mengubah pemesanan yang sudah terjadi — harga
   dibekukan ke consultation_bookings saat pemesanan.
   ================================================================ */
const RT = { rows: [], loaded: false, bolehUbah: false, editing: null, draft: null };

const SATUAN_NAMA = nameProxy('satuan');
const LAYANAN_NAMA = nameProxy('layanan');

async function muatTarifSemua() {
  showApiErr('');
  try {
    const { rows, bolehUbah } = await Api.serviceRates();
    RT.rows = rows; RT.bolehUbah = bolehUbah; RT.loaded = true;
    renderTarifTable();
  } catch (err) { showApiErr(err.message || t('rates.loadError')); }
}

function renderTarifTable() {
  $('#addRateBtn').style.display = RT.bolehUbah ? 'inline-flex' : 'none';
  $('#ratesNote').style.display = RT.bolehUbah ? 'none' : 'flex';
  $('#ratesEmpty').style.display = RT.rows.length ? 'none' : 'block';

  $('#ratesBody').innerHTML = RT.rows.map((r, i) => {
    const harga = r.butuh_penawaran
      ? `<span style="color:var(--muted)">${esc(t('rates.penawaran'))}</span>`
      : `<span class="doc">${rupiah(r.harga)}</span>${r.harga_termasuk_ppn
          ? `<div class="sub">${esc(t('rates.termasukPpn'))}</div>` : ''}`;
    const berlaku = `${esc(tglTampil(r.berlaku_sejak) || '—')}${r.berlaku_sampai
      ? ' – ' + esc(tglTampil(r.berlaku_sampai)) : ''}`;
    return `<tr data-id="${r.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(r.nama)}</div>
        <div class="sub"><span class="doc">${esc(r.kode)}</span>${r.deskripsi ? ' · ' + esc(r.deskripsi) : ''}</div></td>
      <td><span class="tag">${esc(LAYANAN_NAMA[r.jenis_layanan] || r.jenis_layanan)}</span></td>
      <td>${harga}</td>
      <td>${r.butuh_penawaran ? '—' : esc(SATUAN_NAMA[r.satuan] || r.satuan)}</td>
      <td>${r.durasi_menit ? esc(r.durasi_menit + ' ' + t('prospect.menit')) : '—'}</td>
      <td><span class="doc">${berlaku}</span></td>
      <td><span class="pill ${r.aktif ? 'p-aman' : 'p-tidak_dipantau'}">${
        esc(r.aktif ? t('rates.aktif') : t('rates.nonaktif'))}</span></td>
    </tr>`;
  }).join('');

  if (RT.bolehUbah) {
    document.querySelectorAll('#ratesBody tr[data-id]').forEach((tr) => {
      tr.onclick = () => bukaTarifDrawer(RT.rows.find((r) => r.id === tr.dataset.id));
    });
  } else {
    document.querySelectorAll('#ratesBody tr[data-id]').forEach((tr) => {
      tr.style.cursor = 'default';
    });
  }
}

function tarifFormHTML(err) {
  const d = RT.draft;
  const e = (k) => (err && err[k]) ? `<div class="err">${esc(err[k])}</div>` : '';
  const opsiDari = (arr, proxy, val) => arr.map((v) =>
    `<option value="${v}" ${val === v ? 'selected' : ''}>${esc(proxy[v])}</option>`).join('');

  return `
  <div class="grid2">
    <div class="f"><label>${t('rates.f.kode')} <span class="req">*</span></label>
      <input id="rt_kode" value="${esc(d.kode || '')}" ${RT.editing ? 'disabled' : ''}>
      ${RT.editing ? `<div class="hint">${esc(t('rates.f.kodeLocked'))}</div>` : ''}${e('kode')}</div>
    <div class="f"><label>${t('rates.f.jenis')} <span class="req">*</span></label>
      <select id="rt_jenis" ${RT.editing ? 'disabled' : ''}>
        ${opsiDari(['konsultasi_online','konsultasi_offline','konsultasi_luar_kota'], LAYANAN_NAMA, d.jenisLayanan)}
      </select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('rates.f.nama')} <span class="req">*</span></label>
    <input id="rt_nama" value="${esc(d.nama || '')}">${e('nama')}</div>
  <div class="f" style="margin-top:12px"><label>${t('rates.f.deskripsi')}</label>
    <input id="rt_deskripsi" value="${esc(d.deskripsi || '')}"></div>

  <label class="chk" style="margin-top:10px"><input type="checkbox" id="rt_penawaran" ${d.butuhPenawaran ? 'checked' : ''}>
    <span><b>${t('rates.f.penawaran')}</b>${t('rates.f.penawaranDesc')}</span></label>

  <div class="grid2" style="margin-top:6px">
    <div class="f"><label>${t('rates.f.harga')}</label>
      <input id="rt_harga" inputmode="numeric" value="${d.harga != null ? d.harga : ''}" ${d.butuhPenawaran ? 'disabled' : ''}>
      <div class="hint">${esc(t('rates.f.hargaHint'))}</div>${e('harga')}</div>
    <div class="f"><label>${t('rates.f.satuan')}</label>
      <select id="rt_satuan" ${d.butuhPenawaran ? 'disabled' : ''}>
        ${opsiDari(['per_jam','per_sesi','per_hari'], SATUAN_NAMA, d.satuan)}
      </select></div>
  </div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('rates.f.durasi')}</label>
      <input id="rt_durasi" inputmode="numeric" value="${d.durasiMenit != null ? d.durasiMenit : ''}">
      <div class="hint">${esc(t('rates.f.durasiHint'))}</div></div>
    <div class="f"><label>${t('rates.f.urutan')}</label>
      <input id="rt_urutan" inputmode="numeric" value="${d.urutan != null ? d.urutan : 0}"></div>
  </div>

  <label class="chk"><input type="checkbox" id="rt_ppn" ${d.hargaTermasukPpn ? 'checked' : ''}>
    <span><b>${t('rates.f.ppn')}</b>${t('rates.f.ppnDesc')}</span></label>
  <div class="f" style="margin-top:6px"><label>${t('rates.f.berlakuSampai')}</label>
    <input type="date" id="rt_sampai" value="${esc(d.berlakuSampai || '')}">
    <div class="hint">${esc(t('rates.f.berlakuHint'))}</div></div>
  <label class="chk"><input type="checkbox" id="rt_aktif" ${d.aktif !== false ? 'checked' : ''}>
    <span><b>${t('rates.f.aktif')}</b>${t('rates.f.aktifDesc')}</span></label>

  <div class="warnbox wb-warn" style="margin:14px 0 0">
    <span class="ic">◆</span>
    <div><b>${esc(t('rates.frozenTitle'))}</b>${esc(t('rates.frozenDesc'))}</div>
  </div>`;
}

function bacaTarifForm() {
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const d = RT.draft;
  if (!RT.editing) { d.kode = g('rt_kode'); d.jenisLayanan = g('rt_jenis'); }
  d.nama = g('rt_nama');
  d.deskripsi = g('rt_deskripsi') || null;
  d.butuhPenawaran = $('#rt_penawaran').checked;
  const h = g('rt_harga').replace(/[^\d]/g, '');
  d.harga = d.butuhPenawaran || h === '' ? null : Number(h);
  d.satuan = g('rt_satuan');
  const du = g('rt_durasi').replace(/[^\d]/g, '');
  d.durasiMenit = du === '' ? null : Number(du);
  d.urutan = Number(g('rt_urutan').replace(/[^\d]/g, '')) || 0;
  d.hargaTermasukPpn = $('#rt_ppn').checked;
  d.berlakuSampai = g('rt_sampai') || null;
  d.aktif = $('#rt_aktif').checked;
}

function bukaTarifDrawer(row) {
  RT.editing = row ? row.id : null;
  RT.draft = row ? {
    kode: row.kode, nama: row.nama, deskripsi: row.deskripsi,
    jenisLayanan: row.jenis_layanan, satuan: row.satuan,
    durasiMenit: row.durasi_menit, harga: row.harga != null ? Number(row.harga) : null,
    hargaTermasukPpn: row.harga_termasuk_ppn, butuhPenawaran: row.butuh_penawaran,
    berlakuSampai: row.berlaku_sampai ? String(row.berlaku_sampai).slice(0, 10) : null,
    aktif: row.aktif, urutan: row.urutan,
  } : {
    kode: '', nama: '', deskripsi: null, jenisLayanan: 'konsultasi_online',
    satuan: 'per_jam', durasiMenit: 60, harga: null, hargaTermasukPpn: false,
    butuhPenawaran: false, berlakuSampai: null, aktif: true, urutan: 0,
  };
  gambarTarifDrawer();
  bukaAuxDrawer('rate', RT.editing ? t('rates.drawerTitle') : t('rates.drawerTitleNew'),
    tarifFormHTML(), simpanTarif);
  pasangTarifEvent();
}

function gambarTarifDrawer(err) {
  const body = $('#auxDBody');
  if (body && body.innerHTML) { body.innerHTML = tarifFormHTML(err); pasangTarifEvent(); }
}

function pasangTarifEvent() {
  const p = $('#rt_penawaran');
  if (p) p.addEventListener('change', () => { bacaTarifForm(); gambarTarifDrawer(); });
}

async function simpanTarif() {
  bacaTarifForm();
  const d = RT.draft, err = {};
  if (!RT.editing && !d.kode) err.kode = t('rates.err.kode');
  if (!d.nama) err.nama = t('rates.err.nama');
  if (!d.butuhPenawaran && d.harga == null) err.harga = t('rates.err.harga');
  if (Object.keys(err).length) return gambarTarifDrawer(err);

  const btn = $('#auxDSave'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (RT.editing) await Api.updateRate(RT.editing, d);
    else await Api.createRate(d);
    tutupAuxDrawer();
    RT.loaded = false;
    await muatTarifSemua();
    toast(t('common.saved'), 'success');
  } catch (e) {
    toast(e.message || t('common.saveFailed'), 'error');
  } finally { btn.disabled = false; btn.textContent = t('common.save'); }
}

$('#addRateBtn').onclick = () => bukaTarifDrawer(null);

/* ================================================================
   MODUL TEAM & USERS — akun pengguna sisi klien

   Batas wewenangnya sudah ditetapkan RLS sejak Fase 1: hanya
   app.is_mikk_admin() (Managing Partner / Admin Staf) yang boleh menulis
   client_memberships. Admin sisi klien pun tidak bisa menambah anggota
   organisasinya sendiri. Antarmuka ini mengikuti batas itu, tidak
   melonggarkannya.

   Kata sandi awal dibuat server dan hanya dikembalikan SEKALI. Tidak ada
   tempat di antarmuka ini yang bisa menampilkannya lagi — kalau hilang,
   jalannya adalah menerbitkan yang baru.
   ================================================================ */
const TM = { rows: [], loaded: false, bolehKelola: false, draft: null };

async function muatTimSemua() {
  showApiErr('');
  try {
    const { rows, bolehKelola } = await Api.clientUsers(S.ws.client_org_id);
    TM.rows = rows; TM.bolehKelola = bolehKelola; TM.loaded = true;
    renderTimTable();
  } catch (err) { showApiErr(err.message || t('team.loadError')); }
}

function renderTimTable() {
  $('#addTeamBtn').style.display = TM.bolehKelola ? 'inline-flex' : 'none';
  $('#teamNote').style.display = TM.bolehKelola ? 'none' : 'flex';
  $('#teamEmpty').style.display = TM.rows.length ? 'none' : 'block';

  const n = (p) => TM.rows.filter((r) => r.peran === p).length;
  $('#teamCards').innerHTML = [
    statCard(t('team.card.total'), TM.rows.length, 'acc-info', t('team.card.total.note'), 'users'),
    statCard(t('team.card.admin'), n('admin_klien'), 'acc-repl', t('team.card.admin.note'), 'shield'),
    statCard(t('team.card.aktif'), TM.rows.filter((r) => r.membership_aktif && r.user_aktif).length,
      'acc-ok', t('team.card.aktif.note'), 'check'),
  ].join('');

  $('#teamBody').innerHTML = TM.rows.map((r, i) => {
    const nonaktif = !r.membership_aktif || !r.user_aktif;
    const aksi = TM.bolehKelola ? `<div class="rowact">
      <button class="iconbtn" data-edit="${r.membership_id}" title="${esc(t('team.editRole'))}">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
      <button class="iconbtn" data-reset="${r.user_id}" data-nama="${esc(r.nama)}" title="${esc(t('team.resetPass'))}">
        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>
    </div>` : '<span style="color:var(--muted-2)">—</span>';
    return `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td>${whoMini(r.nama, null)}</td>
      <td><span class="doc">${esc(r.email)}</span></td>
      <td><span class="tag">${esc(PERAN_LABEL[r.peran] || r.peran)}</span></td>
      <td>${r.punya_sandi
        ? `<span class="pill p-aman">${esc(t('team.sandiAda'))}</span>`
        : `<span class="pill p-peringatan">${esc(t('team.sandiBelum'))}</span>`}</td>
      <td><span class="pill ${nonaktif ? 'p-tidak_dipantau' : 'p-aman'}">${
        esc(nonaktif ? t('team.nonaktif') : t('team.aktif'))}</span></td>
      <td>${aksi}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#teamBody [data-edit]').forEach((b) => {
    b.onclick = () => bukaTimDrawer(TM.rows.find((r) => r.membership_id === b.dataset.edit));
  });
  document.querySelectorAll('#teamBody [data-reset]').forEach((b) => {
    b.onclick = () => resetSandi(b.dataset.reset, b.dataset.nama);
  });
}

/* Menampilkan kredensial sekali, dengan peringatan bahwa ini satu-satunya
   kesempatan membacanya. */
function tampilkanKredensial(nama, email, sandi, targetId, opts) {
  targetId = targetId || 'teamNewCred';
  const emailInfo = opts && opts.emailTerkirim
    ? `<div class="hint" style="color:#9ee6b4;margin-top:6px">${esc(t('team.credEmailSent'))}</div>`
    : (opts && opts.emailTerkirim === false
      ? `<div class="hint" style="color:#f4c2ce;margin-top:6px">${esc(t('team.credEmailFailed'))}</div>` : '');
  $('#' + targetId).innerHTML = `<div class="acccode">
    <div class="kode">${esc(sandi)}</div>
    <div class="tx">
      <b>${esc(t('team.credTitle', { nama }))}</b>
      ${esc(t('team.credDesc'))}
      ${email ? `<div style="margin-top:4px;font-family:var(--mono);color:rgba(255,255,255,.9)">${esc(email)}</div>` : ''}
      ${emailInfo}
    </div>
    <button class="btn ghost" id="tutupCred_${targetId}">${esc(t('team.credClose'))}</button>
  </div>`;
  $('#tutupCred_' + targetId).onclick = () => { $('#' + targetId).innerHTML = ''; };
}

function timFormHTML(err) {
  const d = TM.draft;
  const e = (k) => (err && err[k]) ? `<div class="err">${esc(err[k])}</div>` : '';
  const opsiPeran = ['admin_klien', 'legal_manager', 'viewer'].map((v) =>
    `<option value="${v}" ${d.peran === v ? 'selected' : ''}>${esc(PERAN_LABEL[v])}</option>`).join('');

  return `
  ${d.membershipId ? '' : `
  <div class="f"><label>${t('team.f.nama')} <span class="req">*</span></label>
    <input id="tm_nama" value="${esc(d.nama || '')}">${e('nama')}</div>
  <div class="f" style="margin-top:12px"><label>${t('team.f.email')} <span class="req">*</span></label>
    <input id="tm_email" type="email" value="${esc(d.email || '')}">
    <div class="hint">${esc(t('team.f.emailHint'))}</div>${e('email')}</div>
  <div class="f" style="margin-top:12px"><label>${t('team.f.noHp')}</label>
    <input id="tm_hp" inputmode="tel" value="${esc(d.noHp || '')}"></div>`}

  <div class="f" style="margin-top:12px"><label>${t('team.f.peran')} <span class="req">*</span></label>
    <select id="tm_peran">${opsiPeran}</select>
    <div class="hint">${esc(t('team.f.peranHint'))}</div></div>

  ${d.membershipId ? `
  <label class="chk" style="margin-top:6px"><input type="checkbox" id="tm_aktif" ${d.aktif !== false ? 'checked' : ''}>
    <span><b>${t('team.f.aktif')}</b>${t('team.f.aktifDesc')}</span></label>` : `
  <div class="warnbox wb-warn" style="margin:14px 0 0">
    <span class="ic">🔑</span>
    <div><b>${esc(t('team.f.sandiTitle'))}</b>${esc(t('team.f.sandiDesc'))}</div>
  </div>`}`;
}

function bukaTimDrawer(row) {
  TM.draft = row ? {
    membershipId: row.membership_id, nama: row.nama, email: row.email,
    peran: row.peran, aktif: row.membership_aktif,
  } : { membershipId: null, nama: '', email: '', noHp: '', peran: 'legal_manager' };
  bukaAuxDrawer('team', row ? t('team.drawerTitle') : t('team.drawerTitleNew'),
    timFormHTML(), simpanTim);
}

function gambarTimDrawer(err) {
  const body = $('#auxDBody');
  if (body) body.innerHTML = timFormHTML(err);
}

async function simpanTim() {
  const d = TM.draft;
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const err = {};

  if (!d.membershipId) {
    d.nama = g('tm_nama'); d.email = g('tm_email'); d.noHp = g('tm_hp');
    if (!d.nama) err.nama = t('team.err.nama');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) err.email = t('team.err.email');
  }
  d.peran = g('tm_peran');
  if ($('#tm_aktif')) d.aktif = $('#tm_aktif').checked;
  if (Object.keys(err).length) return gambarTimDrawer(err);

  const btn = $('#auxDSave'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (d.membershipId) {
      await Api.updateClientUser(d.membershipId, { peran: d.peran, aktif: d.aktif });
      tutupAuxDrawer();
      toast(t('common.saved'), 'success');
    } else {
      const res = await Api.createClientUser({
        clientOrgId: S.ws.client_org_id, nama: d.nama, email: d.email,
        noHp: d.noHp || null, peran: d.peran,
      });
      tutupAuxDrawer();
      if (res.kataSandiAwal) {
        tampilkanKredensial(d.nama, d.email, res.kataSandiAwal, 'teamNewCred', { emailTerkirim: res.emailTerkirim });
      }
      toast(res.pesan || t('team.created'), 'success');
    }
    TM.loaded = false;
    await muatTimSemua();
  } catch (e) {
    toast(e.message || t('common.saveFailed'), 'error');
  } finally { btn.disabled = false; btn.textContent = t('common.save'); }
}

async function resetSandi(userId, nama) {
  // Menerbitkan kata sandi baru membatalkan yang lama — pastikan disengaja.
  if (!(await confirmDialog(t('team.resetConfirm', { nama }), { okText: t('team.resetPass') }))) return;
  try {
    const { kataSandiAwal, emailTerkirim } = await Api.resetClientPassword(userId);
    const baris = TM.rows.find((r) => r.user_id === userId);
    tampilkanKredensial(nama, baris ? baris.email : '', kataSandiAwal, 'teamNewCred', { emailTerkirim });
    TM.loaded = false;
    await muatTimSemua();
    toast(t('team.resetDone'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}

$('#addTeamBtn').onclick = () => bukaTimDrawer(null);

/* ================================================================
   MODUL STAF MIKK — akun internal (admin & PIC/legal), berbeda dari
   modul Team & Users di atas (itu akun CUSTOMER, per client_org).
   Kata sandi awal di sini TIDAK dikirim ke email (lihat catatan
   server/routes/staff-users.routes.js) — cuma ditampilkan sekali,
   sama seperti perilaku Team sebelum pengiriman email ditambahkan.
   ================================================================ */
const JABATAN_PER_PERAN_SU = {
  admin: ['managing_partner', 'admin_staf'],
  pic_legal: ['senior_associate', 'associate'],
};
const SU = { rows: [], loaded: false, draft: null };

async function muatStaffUsersSemua() {
  showApiErr('');
  try {
    const { rows } = await Api.staffUsers();
    SU.rows = rows; SU.loaded = true;
    renderStaffUsersTable();
  } catch (err) { showApiErr(err.message || t('staffUsers.loadError')); }
}

function renderStaffUsersTable() {
  $('#staffUsersEmpty').style.display = SU.rows.length ? 'none' : 'block';
  $('#staffUsersBody').innerHTML = SU.rows.map((r, i) => {
    const nonaktif = !r.staff_aktif || !r.user_aktif;
    return `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td>${whoMini(r.nama, null)}</td>
      <td><span class="doc">${esc(r.email)}</span></td>
      <td><span class="tag">${esc(t('staffUsers.peran.' + r.peran))}</span></td>
      <td>${esc(JABATAN_NAMA[r.jabatan] || r.jabatan)}${r.gelar ? `, ${esc(r.gelar)}` : ''}</td>
      <td><span class="pill ${nonaktif ? 'p-tidak_dipantau' : 'p-aman'}">${
        esc(nonaktif ? t('team.nonaktif') : t('team.aktif'))}</span></td>
      <td><div class="rowact">
        <button class="iconbtn" data-edit="${r.user_id}" title="${esc(t('team.editRole'))}">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="iconbtn" data-reset="${r.user_id}" data-nama="${esc(r.nama)}" title="${esc(t('staffUsers.resetPw'))}">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#staffUsersBody [data-edit]').forEach((b) => {
    b.onclick = () => bukaStaffDrawer(SU.rows.find((r) => r.user_id === b.dataset.edit));
  });
  document.querySelectorAll('#staffUsersBody [data-reset]').forEach((b) => {
    b.onclick = () => resetSandiStaf(b.dataset.reset, b.dataset.nama);
  });
}

function staffFormHTML(err) {
  const d = SU.draft;
  const e = (k) => (err && err[k]) ? `<div class="err">${esc(err[k])}</div>` : '';
  const opsiJabatan = JABATAN_PER_PERAN_SU[d.peran].map((v) =>
    `<option value="${v}" ${d.jabatan === v ? 'selected' : ''}>${esc(JABATAN_NAMA[v])}</option>`).join('');

  return `
  ${d.userId ? '' : `
  <div class="f"><label>${t('staffUsers.f.nama')} <span class="req">*</span></label>
    <input id="su_nama" value="${esc(d.nama || '')}">${e('nama')}</div>
  <div class="f" style="margin-top:12px"><label>${t('staffUsers.f.email')} <span class="req">*</span></label>
    <input id="su_email" type="email" value="${esc(d.email || '')}">
    <div class="hint">${esc(t('staffUsers.f.emailHint'))}</div>${e('email')}</div>
  <div class="f" style="margin-top:12px"><label>${t('staffUsers.f.noHp')}</label>
    <input id="su_hp" inputmode="tel" value="${esc(d.noHp || '')}"></div>`}

  <div class="f" style="margin-top:12px"><label>${t('staffUsers.f.peran')} <span class="req">*</span></label>
    <select id="su_peran">
      <option value="admin" ${d.peran === 'admin' ? 'selected' : ''}>${esc(t('staffUsers.peran.admin'))}</option>
      <option value="pic_legal" ${d.peran === 'pic_legal' ? 'selected' : ''}>${esc(t('staffUsers.peran.pic_legal'))}</option>
    </select>
    <div class="hint">${esc(t('staffUsers.f.peranHint'))}</div></div>
  <div class="f" style="margin-top:12px"><label>${t('staffUsers.f.jabatan')} <span class="req">*</span></label>
    <select id="su_jabatan">${opsiJabatan}</select></div>
  <div class="f" style="margin-top:12px"><label>${t('staffUsers.f.gelar')}</label>
    <input id="su_gelar" value="${esc(d.gelar || '')}"></div>

  ${d.userId ? `
  <label class="chk" style="margin-top:6px"><input type="checkbox" id="su_aktif" ${d.aktif !== false ? 'checked' : ''}>
    <span><b>${t('staffUsers.f.aktif')}</b>${t('staffUsers.f.aktifDesc')}</span></label>` : `
  <div class="warnbox wb-warn" style="margin:14px 0 0">
    <span class="ic">🔑</span>
    <div><b>${esc(t('team.f.sandiTitle'))}</b>${esc(t('team.f.sandiDesc'))}</div>
  </div>`}`;
}

function bukaStaffDrawer(row) {
  SU.draft = row ? {
    userId: row.user_id, nama: row.nama, email: row.email,
    peran: row.peran, jabatan: row.jabatan, gelar: row.gelar, aktif: row.staff_aktif,
  } : { userId: null, nama: '', email: '', noHp: '', peran: 'pic_legal', jabatan: 'associate', gelar: '' };
  bukaAuxDrawer('staffusers', row ? t('staffUsers.drawerTitle') : t('staffUsers.drawerTitleNew'),
    staffFormHTML(), simpanStaff);
  // Jabatan yang ditawarkan berubah sesuai peran — render ulang badan
  // drawer saja (bukan seluruh layar) saat peran diganti.
  $('#su_peran').onchange = () => {
    SU.draft.peran = $('#su_peran').value;
    SU.draft.jabatan = JABATAN_PER_PERAN_SU[SU.draft.peran][0];
    gambarStaffDrawer();
  };
}

function gambarStaffDrawer(err) {
  const body = $('#auxDBody');
  if (body) body.innerHTML = staffFormHTML(err);
  $('#su_peran').onchange = () => {
    SU.draft.peran = $('#su_peran').value;
    SU.draft.jabatan = JABATAN_PER_PERAN_SU[SU.draft.peran][0];
    gambarStaffDrawer();
  };
}

async function simpanStaff() {
  const d = SU.draft;
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const err = {};

  if (!d.userId) {
    d.nama = g('su_nama'); d.email = g('su_email'); d.noHp = g('su_hp');
    if (!d.nama) err.nama = t('staffUsers.err.nama');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) err.email = t('staffUsers.err.email');
  }
  d.peran = g('su_peran'); d.jabatan = g('su_jabatan'); d.gelar = g('su_gelar');
  if ($('#su_aktif')) d.aktif = $('#su_aktif').checked;
  if (Object.keys(err).length) return gambarStaffDrawer(err);

  const btn = $('#auxDSave'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (d.userId) {
      await Api.updateStaffUser(d.userId, { jabatan: d.jabatan, gelar: d.gelar || null, aktif: d.aktif });
      tutupAuxDrawer();
      toast(t('common.saved'), 'success');
    } else {
      const res = await Api.createStaffUser({
        nama: d.nama, email: d.email, noHp: d.noHp || null, jabatan: d.jabatan, gelar: d.gelar || null,
      });
      tutupAuxDrawer();
      if (res.kataSandiAwal) tampilkanKredensial(d.nama, d.email, res.kataSandiAwal, 'staffNewCred');
      toast(t('staffUsers.created'), 'success');
    }
    SU.loaded = false;
    await muatStaffUsersSemua();
  } catch (e) {
    toast(e.message || t('common.saveFailed'), 'error');
  } finally { btn.disabled = false; btn.textContent = t('common.save'); }
}

async function resetSandiStaf(userId, nama) {
  if (!(await confirmDialog(t('staffUsers.resetConfirm', { nama }), { okText: t('staffUsers.resetPw') }))) return;
  try {
    const { kataSandiAwal } = await Api.resetStaffPassword(userId);
    const baris = SU.rows.find((r) => r.user_id === userId);
    tampilkanKredensial(nama, baris ? baris.email : '', kataSandiAwal, 'staffNewCred');
    toast(t('staffUsers.resetDone'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}

$('#addStaffBtn').onclick = () => bukaStaffDrawer(null);

/* ================================================================
   MODUL PERKARA SAYA — dashboard pribadi lintas klien
   Beda dari modul Litigasi & Sidang (secCases): itu selalu terikat pada
   satu client_org_id (workspace terpilih). Di sini SEMUA perkara yang
   ditugaskan ke pengguna yang sedang login (PIC atau lewat
   client_assignments) ditampilkan bersama, lintas klien retainer,
   perorangan, maupun kelompok (GET /api/my/cases, /api/my/summary).
   Sekalian menampung layar kelola Klien Perorangan & Kelompok, karena
   keduanya erat: perkara jenis baru butuh pemiliknya didaftarkan dulu.
   ================================================================ */
const MC = { rows: [], summary: null, loaded: false, ref: null, orgRows: [] };
const KP = { individuals: [], groups: [], loaded: false };

async function muatMyCasesSemua() {
  showApiErr('');
  try {
    const [list, sum] = await Promise.all([Api.myCases(), Api.mySummary()]);
    MC.rows = list.rows; MC.summary = sum.summary; MC.loaded = true;
    await muatKlienKhususSemua();
    renderMyCasesCards(); renderMyCasesTable(); renderKlienKhususPanel();
  } catch (err) { showApiErr(err.message || t('mycases.loadError')); }
}
async function muatKlienKhususSemua() {
  try {
    const [individuals, groups] = await Promise.all([Api.individualClients(), Api.clientGroups()]);
    KP.individuals = individuals.rows; KP.groups = groups.rows; KP.loaded = true;
  } catch (e) { /* non-fatal: panel klien tetap kosong, sisa layar tetap tampil */ }
}
function renderMyCasesCards() {
  const s = MC.summary || {};
  $('#myCasesCards').innerHTML = [
    statCard(t('mycases.card.aktif'), s.perkara_aktif ?? 0, 'acc-info', t('mycases.card.aktif.note'), 'scale'),
    statCard(t('mycases.card.sidang7'), s.sidang_7_hari ?? 0, 'acc-warn', t('mycases.card.sidang7.note'), 'clock'),
    statCard(t('mycases.card.retainer'), s.klien_retainer ?? 0, '', t('mycases.card.retainer.note'), 'bank'),
    statCard(t('mycases.card.perorangan'), s.klien_perorangan ?? 0, '', t('mycases.card.perorangan.note'), 'users'),
    statCard(t('mycases.card.kelompok'), s.klien_kelompok ?? 0, '', t('mycases.card.kelompok.note'), 'shield'),
  ].join('');
}
function renderMyCasesTable() {
  $('#myCasesEmpty').style.display = MC.rows.length ? 'none' : 'block';
  $('#myCasesBody').innerHTML = MC.rows.map((c, i) => {
    const sidang = c.sidang_terdekat_tanggal
      ? `${esc(tglTampil(c.sidang_terdekat_tanggal))}${c.hari_ke_sidang != null ? ` <span class="days ${c.hari_ke_sidang <= 7 ? 'soon' : ''}">(${t('common.daysLeft', { n: c.hari_ke_sidang })})</span>` : ''}`
      : `<span style="color:var(--muted-2)">${esc(t('cases.belumDijadwalkan'))}</span>`;
    return `<tr data-id="${c.id}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><div class="ttl">${esc(c.klien_nama || '—')}</div><span class="tag">${esc(JENIS_KLIEN_NAMA[c.jenis_klien] || c.jenis_klien)}</span></td>
      <td><div class="ttl">${esc(c.nomor_perkara)}</div>${c.lawan_pihak_teks ? `<div class="sub">vs ${esc(c.lawan_pihak_teks)}</div>` : ''}</td>
      <td><span class="tag">${esc(TAHAP_NAMA[c.tahap] || c.tahap)}</span></td>
      <td>${sidang}</td>
      <td><span class="pill ${c.status_siklus === 'aktif' ? 'p-aman' : 'p-tidak_dipantau'}">${esc(CASE_STATUS_NAMA[c.status_siklus] || c.status_siklus)}</span></td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#myCasesBody tr[data-id]').forEach((tr) => {
    tr.onclick = () => bukaMyCaseDrawer(MC.rows.find((c) => c.id === tr.dataset.id));
  });
}
function pemilikDariBarisPerkara(row) {
  if (row.client_org_id) return { clientOrgId: row.client_org_id };
  if (row.individual_client_id) return { individualClientId: row.individual_client_id };
  return { clientGroupId: row.client_group_id };
}
/* Sengaja lebih sederhana dari drawer di modul Litigasi & Sidang (tanpa
   jadwal sidang/catatan sidang) — mengedit itu tetap lewat modul Litigasi
   & Sidang milik klien terkait. Di sini fokus ke apa yang paling sering
   diubah dari sudut pandang "perkara saya": tahap, status, PIC, catatan. */
let mcEditing = null;
async function bukaMyCaseDrawer(row) {
  mcEditing = row;
  try { MC.ref = await Api.casesReference(pemilikDariBarisPerkara(row)); }
  catch (e) { MC.ref = { pic: [], tahap: [], peranKlien: [], statusSiklus: [] }; }
  bukaAuxDrawer('mycase', t('mycases.drawerTitle', { nomor: row.nomor_perkara }), myCaseFormHTML(row), simpanMyCase);
  renderLampiranPanel('lampiran_mycase', 'case', row.id, pemilikDariBarisPerkara(row));
}
function myCaseFormHTML(row) {
  const r = MC.ref;
  return `
  <div class="f"><label>${t('mycases.f.klien')}</label>
    <div class="ttl">${esc(row.klien_nama)} <span class="tag">${esc(JENIS_KLIEN_NAMA[row.jenis_klien] || row.jenis_klien)}</span></div></div>
  <div class="grid2" style="margin-top:12px">
    <div class="f"><label>${t('cases.f.tahap')}</label><select id="mc_tahap">${opsi(r.tahap.map((v) => ({ v, l: TAHAP_NAMA[v] })), row.tahap, t('common.none'))}</select></div>
    <div class="f"><label>${t('cases.f.status')}</label><select id="mc_status">${opsi(r.statusSiklus.map((v) => ({ v, l: CASE_STATUS_NAMA[v] || v })), row.status_siklus, t('common.none'))}</select></div>
  </div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.pic')}</label>
    <select id="mc_pic">${opsi(r.pic.map((p) => ({ v: p.id, l: p.nama })), row.pic_legal_id, t('common.none'))}</select></div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.keterangan')}</label><textarea id="mc_ket" rows="3">${esc(row.keterangan || '')}</textarea></div>
  <p class="hint" style="margin-top:10px">${esc(t('mycases.editHint'))}</p>
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    <h4 style="font-family:var(--serif);font-size:14px;margin:0 0 10px">${t('lampiran.title')}</h4>
    <div id="lampiran_mycase"></div>
  </div>`;
}
async function simpanMyCase() {
  const body = {
    tahap: $('#mc_tahap').value, statusSiklus: $('#mc_status').value,
    picLegalId: $('#mc_pic').value || null, keterangan: $('#mc_ket').value.trim() || null,
  };
  try {
    await Api.updateCase(mcEditing.id, body);
    tutupAuxDrawer(); await muatMyCasesSemua(); toast(t('common.saved'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}

/* ---- + Tambah Perkara Baru: pilih dulu jenis klien pemiliknya ---- */
async function bukaMyCaseBaruDrawer() {
  let orgRows = [];
  try { orgRows = (await Api.clientOrgs()).rows; } catch (e) { /* tetap lanjut, list org kosong */ }
  MC.orgRows = orgRows;
  // Tahap perkara sekarang dari Master Data (bukan hardcode) — /reference
  // tidak butuh pemilik untuk ini, cuma untuk daftar PIC (lihat
  // cases.routes.js: pemilik opsional di endpoint ini).
  try { MC.refBaru = await Api.casesReference(); } catch (e) { MC.refBaru = { tahap: [] }; }
  await muatKlienKhususSemua();
  bukaAuxDrawer('mycasebaru', t('mycases.newTitle'), myCaseBaruFormHTML(), simpanMyCaseBaru);
  $('#mcb_tipe').addEventListener('change', gambarMyCaseBaruPemilik);
  gambarMyCaseBaruPemilik();
}
function myCaseBaruFormHTML() {
  return `
  <div class="f"><label>${t('mycases.f.tipeKlien')}</label>
    <select id="mcb_tipe">
      <option value="org">${esc(t('mycases.tipe.retainer'))}</option>
      <option value="indiv">${esc(t('mycases.tipe.perorangan'))}</option>
      <option value="grup">${esc(t('mycases.tipe.kelompok'))}</option>
    </select></div>
  <div class="f" id="mcb_pemilikWrap" style="margin-top:12px"></div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.nomor')} <span class="req">*</span></label><input id="mcb_nomor"></div>
  <div class="f" style="margin-top:12px"><label>${t('cases.f.tahap')}</label>
    <select id="mcb_tahap">${opsi(MC.refBaru.tahap.map((v) => ({ v, l: TAHAP_NAMA[v] })), 'pendaftaran', t('common.none'))}</select></div>
  <p class="hint" style="margin-top:10px">${esc(t('mycases.newHint'))}</p>`;
}
function gambarMyCaseBaruPemilik() {
  const tipe = $('#mcb_tipe').value, wrap = $('#mcb_pemilikWrap');
  if (tipe === 'indiv') {
    wrap.innerHTML = `<label>${t('mycases.f.klien')}</label>
      <select id="mcb_pemilik">${opsi(KP.individuals.map((c) => ({ v: c.id, l: c.nama })), null, t('common.none'))}</select>
      <div class="hint">${esc(t('mycases.belumAda'))} <button type="button" class="btn ghost" id="mcb_barIndiv" style="padding:2px 8px;font-size:11px">${esc(t('mycases.tambahCepat'))}</button></div>`;
    $('#mcb_barIndiv').onclick = async () => {
      const nama = window.prompt(t('mycases.promptNamaIndiv'));
      if (!nama || !nama.trim()) return;
      try {
        await Api.createIndividualClient({ nama: nama.trim() });
        await muatKlienKhususSemua();
        gambarMyCaseBaruPemilik();
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
  } else if (tipe === 'grup') {
    wrap.innerHTML = `<label>${t('mycases.f.klien')}</label>
      <select id="mcb_pemilik">${opsi(KP.groups.map((g) => ({ v: g.id, l: g.nama_kelompok })), null, t('common.none'))}</select>`;
  } else {
    wrap.innerHTML = `<label>${t('mycases.f.klien')}</label>
      <select id="mcb_pemilik">${opsi(MC.orgRows.map((o) => ({ v: o.client_org_id, l: o.nama_singkat })), null, t('common.none'))}</select>`;
  }
}
async function simpanMyCaseBaru() {
  const tipe = $('#mcb_tipe').value;
  const pemilikId = $('#mcb_pemilik')?.value;
  const nomor = $('#mcb_nomor').value.trim();
  if (!pemilikId) return toast(t('mycases.err.klien'), 'warning');
  if (!nomor) return toast(t('cases.err.nomor'), 'warning');
  const body = {
    nomorPerkara: nomor, tahap: $('#mcb_tahap').value,
    // PIC diisi otomatis ke diri sendiri — supaya perkara baru langsung
    // muncul di "Perkara Saya" tanpa langkah penugasan terpisah. Bisa
    // diubah lagi lewat drawer edit (bukaMyCaseDrawer) kalau perlu.
    picLegalId: S.user?.id || null,
    clientOrgId: tipe === 'org' ? pemilikId : null,
    individualClientId: tipe === 'indiv' ? pemilikId : null,
    clientGroupId: tipe === 'grup' ? pemilikId : null,
  };
  try {
    await Api.createCase(body);
    tutupAuxDrawer(); await muatMyCasesSemua(); toast(t('common.saved'), 'success');
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
}
$('#addMyCaseBtn').onclick = () => bukaMyCaseBaruDrawer();

/* ---- Klien Perorangan & Kelompok — panel kelola sederhana ---- */
function renderKlienKhususPanel() {
  $('#klienIndivBody').innerHTML = KP.individuals.map((c, i) => `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td>${esc(c.nama)}</td><td>${esc(c.nik || '—')}</td><td>${esc(c.no_hp || '—')}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted-2);padding:16px">${esc(t('mycases.klien.kosong'))}</td></tr>`;
  $('#klienGrupBody').innerHTML = KP.groups.map((g, i) => `<tr>
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td>${esc(g.nama_kelompok)}</td>
      <td>${(g.anggota || []).map((a) => esc(a.nama)).join(', ') || '—'}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--muted-2);padding:16px">${esc(t('mycases.klien.kosong'))}</td></tr>`;
}
function bukaKlienIndivDrawer() {
  bukaAuxDrawer('klienindiv', t('mycases.indivDrawerTitle'), `
    <div class="f"><label>${t('mycases.f.nama')} <span class="req">*</span></label><input id="ki_nama"></div>
    <div class="grid2" style="margin-top:12px">
      <div class="f"><label>${t('mycases.f.nik')}</label><input id="ki_nik"></div>
      <div class="f"><label>${t('mycases.f.noHp')}</label><input id="ki_hp"></div>
    </div>
    <div class="f" style="margin-top:12px"><label>${t('mycases.f.alamat')}</label><textarea id="ki_alamat" rows="2"></textarea></div>`,
    async () => {
      const nama = $('#ki_nama').value.trim();
      if (!nama) return toast(t('mycases.err.nama'), 'warning');
      try {
        await Api.createIndividualClient({
          nama, nik: $('#ki_nik').value.trim() || null,
          noHp: $('#ki_hp').value.trim() || null, alamat: $('#ki_alamat').value.trim() || null,
        });
        tutupAuxDrawer(); await muatKlienKhususSemua(); renderKlienKhususPanel(); toast(t('common.saved'), 'success');
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    });
}
function bukaKlienGrupDrawer() {
  bukaAuxDrawer('kliengrup', t('mycases.grupDrawerTitle'), `
    <div class="f"><label>${t('mycases.f.namaKelompok')} <span class="req">*</span></label><input id="kg_nama"></div>
    <div class="f" style="margin-top:12px"><label>${t('mycases.f.anggota')}</label>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto">
        ${KP.individuals.map((c) => `<label class="chk"><input type="checkbox" value="${c.id}" class="kg_anggota"><span>${esc(c.nama)}</span></label>`).join('')
          || `<p class="hint">${esc(t('mycases.klien.kosong'))}</p>`}
      </div></div>`,
    async () => {
      const nama = $('#kg_nama').value.trim();
      if (!nama) return toast(t('mycases.err.namaKelompok'), 'warning');
      const anggotaIds = Array.from(document.querySelectorAll('.kg_anggota:checked')).map((el) => el.value);
      try {
        await Api.createClientGroup({ namaKelompok: nama, anggotaIds });
        tutupAuxDrawer(); await muatKlienKhususSemua(); renderKlienKhususPanel(); toast(t('common.saved'), 'success');
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    });
}
$('#addKlienIndivBtn').onclick = () => bukaKlienIndivDrawer();
$('#addKlienGrupBtn').onclick = () => bukaKlienGrupDrawer();

/* ================================================================
   PRATINJAU DOKUMEN — dipakai Arsip Dokumen (secDocs) & Profil Saya.
   Tidak ada endpoint baru: blob yang sama dengan unduhan, ditampilkan di
   modal alih-alih dipaksa men-download (lihat Api.previewDocumentBlob).
   ================================================================ */
// Format Office (docx/xlsx/pptx + varian lama .doc/.xls/.ppt) tidak bisa
// dirender langsung di browser lewat <img>/<iframe> blob seperti gambar/PDF
// — dipakai Google Docs Viewer, yang mengambil sendiri berkasnya lewat URL
// publik berumur pendek (lihat POST /api/documents/:id/preview-link).
// Trade-off ini disengaja (dikonfirmasi pengguna): isi dokumen terkirim ke
// server Google selama link ~5 menit itu valid.
const OFFICE_MIME = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

async function bukaPreviewDokumen(id, mime, nama) {
  const modal = $('#previewModal'), body = $('#previewBody');
  $('#previewTitle').textContent = nama || '';
  body.innerHTML = `<p class="hint">${esc(t('docs.previewLoading'))}</p>`;
  modal.style.display = 'flex';
  try {
    if (OFFICE_MIME.has(mime)) {
      const { url } = await Api.createPreviewLink(id);
      const viewerUrl = 'https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(url);
      body.innerHTML = `<iframe src="${viewerUrl}" title="${esc(nama || '')}" style="width:100%;height:75vh;border:0"></iframe>
        <p class="hint" style="margin-top:8px">${esc(t('docs.previewOfficeNote'))}</p>`;
      return;
    }
    const blob = await Api.previewDocumentBlob(id);
    const url = URL.createObjectURL(blob);
    if ((mime || '').startsWith('image/')) {
      body.innerHTML = `<img src="${url}" alt="${esc(nama || '')}" style="max-width:100%;max-height:75vh;display:block;margin:0 auto">`;
    } else if (mime === 'application/pdf') {
      body.innerHTML = `<iframe src="${url}" title="${esc(nama || '')}" style="width:100%;height:75vh;border:0"></iframe>`;
    } else {
      body.innerHTML = `<p class="hint">${esc(t('docs.previewUnsupported'))}</p>`;
    }
  } catch (e) {
    body.innerHTML = `<p class="hint">${esc(e.message || t('docs.downloadFail'))}</p>`;
  }
}
function tutupPreviewDokumen() {
  $('#previewModal').style.display = 'none';
  $('#previewBody').innerHTML = '';
}
$('#previewClose').onclick = tutupPreviewDokumen;
$('#previewModal').addEventListener('click', (e) => { if (e.target.id === 'previewModal') tutupPreviewDokumen(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#previewModal').style.display === 'flex') tutupPreviewDokumen(); });

/* ================================================================
   MODUL PROFIL SAYA — satu layar per peran (staf & klien)
   Data legalitas milik peran yang sedang login + daftar proyek/perkara
   yang ditangani + dokumen milik proyek terpilih (lewat endpoint
   dokumen yang sudah ada — lihat renderProfilDocs). Staf boleh
   mengedit data legalitasnya sendiri; klien hanya membaca data
   organisasinya (dikelola staf MIKK seperti sekarang).
   ================================================================ */
const PR = { me: null, projects: [], loaded: false, selected: null };

async function muatProfilSemua() {
  showApiErr('');
  try {
    const [me, projects] = await Promise.all([Api.profileMe(), Api.profileProjects()]);
    PR.me = me; PR.projects = projects.rows; PR.loaded = true;
    renderProfilIdentitas(); renderProfilProjects(); renderProfilDocs();
  } catch (err) { showApiErr(err.message || t('profile.loadError')); }
}
function renderProfilIdentitas() {
  const u = PR.me.user, l = PR.me.legalitas || {};
  const isStaff = l.tipe === 'staf';
  $('#profileCards').innerHTML = [
    statCard(t('profile.card.proyek'), PR.projects.length, 'acc-info', t('profile.card.proyek.note'), 'folder'),
  ].join('');
  $('#profileIdentitas').innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
      <div class="av" style="width:48px;height:48px;font-size:16px">${esc(initials(u.nama))}</div>
      <div><div style="font-family:var(--serif);font-size:16px">${esc(u.nama)}</div>
        <div class="sub">${esc(u.email)}${isStaff && l.jabatan ? ' · ' + esc(JABATAN_NAMA[l.jabatan]) : ''}</div></div>
    </div>
    ${isStaff ? `
    <div class="grid2">
      <div class="f"><label>${t('profile.f.gelar')}</label><input id="pf_gelar" value="${esc(l.gelar || '')}"></div>
      <div class="f"><label>${t('profile.f.nomorIzin')}</label><input id="pf_izin" value="${esc(l.nomor_izin_advokat || '')}"></div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="f"><label>${t('profile.f.nik')}</label><input id="pf_nik" value="${esc(l.nik || '')}"></div>
      <div class="f"><label>${t('profile.f.alamat')}</label><input id="pf_alamat" value="${esc(l.alamat || '')}"></div>
    </div>
    <button class="btn gold" id="pfSaveBtn" style="margin-top:14px">${esc(t('common.save'))}</button>`
    : (l.organisasi || []).map((o) => `
      <div style="margin-bottom:10px">
        <div class="ttl">${esc(o.nama_legal)} <span class="tag">${esc(PERAN_LABEL[o.peran] || o.peran)}</span></div>
        <div class="sub">NPWP: ${esc(o.npwp || '—')} · NIB: ${esc(o.nib || '—')}</div>
        <div class="sub">${esc(o.alamat || '—')}</div>
      </div>`).join('')}`;
  if (isStaff) {
    $('#pfSaveBtn').onclick = async () => {
      try {
        await Api.updateProfileMe({
          gelar: $('#pf_gelar').value.trim() || null, nomorIzinAdvokat: $('#pf_izin').value.trim() || null,
          nik: $('#pf_nik').value.trim() || null, alamat: $('#pf_alamat').value.trim() || null,
        });
        toast(t('common.saved'), 'success');
        PR.me = await Api.profileMe(); renderProfilIdentitas();
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
  }
}
function renderProfilProjects() {
  $('#profileProjectEmpty').style.display = PR.projects.length ? 'none' : 'block';
  $('#profileProjectBody').innerHTML = PR.projects.map((p, i) => `<tr data-i="${i}" style="${PR.selected === i ? 'background:#f8fafc' : ''}">
      <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
      <td><span class="tag">${esc(PROJEK_JENIS_NAMA[p.jenis] || p.jenis)}</span></td>
      <td><div class="ttl">${esc(p.judul)}</div></td>
      <td>${esc(p.klien_nama || '—')}</td>
      <td>${esc(JENIS_KLIEN_NAMA[p.klien_jenis] || p.klien_jenis)}</td>
      <td><span class="tag">${esc(p.status)}</span></td>
    </tr>`).join('');
  document.querySelectorAll('#profileProjectBody tr[data-i]').forEach((tr) => {
    tr.onclick = () => { PR.selected = Number(tr.dataset.i); renderProfilProjects(); renderProfilDocs(); };
  });
}
function pemilikDariProyekProfil(p) {
  if (p.client_org_id) return { clientOrgId: p.client_org_id };
  if (p.individual_client_id) return { individualClientId: p.individual_client_id };
  if (p.client_group_id) return { clientGroupId: p.client_group_id };
  return null;
}
function entityTypeDariJenisProfil(jenis) {
  return jenis === 'perkara' ? 'case' : jenis === 'proyek' ? 'project' : 'contract';
}
async function renderProfilDocs() {
  const wrap = $('#profileDocsPanel');
  const p = PR.selected != null ? PR.projects[PR.selected] : null;
  const owner = p ? pemilikDariProyekProfil(p) : null;
  if (!p || !owner) { wrap.innerHTML = `<p class="hint">${esc(t('profile.docs.pilihDulu'))}</p>`; return; }

  try {
    const { rows } = await Api.documents({ ...owner, entityType: entityTypeDariJenisProfil(p.jenis), entityId: p.id });
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input type="file" id="pf_docFile" style="flex:1">
        <button class="btn gold" id="pf_docUpload" style="padding:7px 14px;font-size:12px">${esc(t('docs.uploadBtn'))}</button>
      </div>
      <div class="tscroll"><table style="min-width:480px"><thead><tr>
        <th style="width:34px">#</th><th>${esc(t('docs.th.nama'))}</th>
        <th>${esc(t('docs.th.ukuran'))}</th><th style="width:160px">${esc(t('docs.th.aksi'))}</th>
      </tr></thead><tbody>${rows.map((d, i) => `<tr>
          <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
          <td>${esc(d.nama_file)}</td><td>${fmtUkuran(d.ukuran_byte)}</td>
          <td><button class="btn ghost" data-preview="${d.id}" data-mime="${esc(d.mime_type || '')}" data-fn="${esc(d.nama_file)}" style="padding:5px 8px;font-size:11px">${esc(t('docs.preview'))}</button>
            <button class="btn ghost" data-dl="${d.id}" data-fn="${esc(d.nama_file)}" style="padding:5px 8px;font-size:11px">${esc(t('docs.download'))}</button></td>
        </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted-2);padding:16px">${esc(t('docs.empty.title'))}</td></tr>`}</tbody></table></div>`;
    document.querySelectorAll('#profileDocsPanel [data-dl]').forEach((btn) => {
      btn.onclick = () => Api.downloadDocument(btn.dataset.dl, btn.dataset.fn).catch((e) => toast(e.message || t('docs.downloadFail'), 'error'));
    });
    document.querySelectorAll('#profileDocsPanel [data-preview]').forEach((btn) => {
      btn.onclick = () => bukaPreviewDokumen(btn.dataset.preview, btn.dataset.mime, btn.dataset.fn);
    });
    $('#pf_docUpload').onclick = async () => {
      const fileEl = $('#pf_docFile');
      if (!fileEl.files.length) return toast(t('docs.uploadHint.pilih'), 'warning');
      const fd = new FormData();
      fd.append('file', fileEl.files[0]);
      Object.entries(owner).forEach(([k, v]) => fd.append(k, v));
      fd.append('kategoriArsip', p.jenis === 'perkara' ? 'perkara' : p.jenis === 'kontrak' ? 'kontrak' : 'lainnya');
      fd.append('entityType', entityTypeDariJenisProfil(p.jenis));
      fd.append('entityId', p.id);
      try { await Api.uploadDocument(fd); fileEl.value = ''; toast(t('docs.uploaded'), 'success'); renderProfilDocs(); }
      catch (e) { toast(e.message || t('docs.uploadHint.fail'), 'error'); }
    };
  } catch (e) { wrap.innerHTML = `<p class="hint">${esc(e.message || t('docs.loadError'))}</p>`; }
}

/* ================================================================
   LAMPIRAN DOKUMEN — panel dipakai ulang di drawer kontrak/izin/
   perkara/proyek/pendampingan. Sama persis pola dengan renderProfilDocs
   di atas, cuma digeneralkan: ownerParams = objek pemilik dokumen
   ({clientOrgId} untuk kontrak/izin/proyek/pendampingan yang selalu
   org-scoped, atau hasil pemilikDariBarisPerkara() untuk perkara yang
   bisa perorangan/kelompok), entityType/entityId = tautan
   document_links yang sudah ada.
   ================================================================ */
async function renderLampiranPanel(containerId, entityType, entityId, ownerParams) {
  const wrap = $('#' + containerId);
  if (!wrap) return;
  if (!entityId) { wrap.innerHTML = `<p class="hint">${esc(t('lampiran.simpanDulu'))}</p>`; return; }
  try {
    const { rows } = await Api.documents({ ...ownerParams, entityType, entityId });
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input type="file" id="${containerId}_file" style="flex:1;font-size:12px">
        <button class="btn ghost" id="${containerId}_upload" type="button" style="padding:7px 14px;font-size:11px">${esc(t('lampiran.uploadBtn'))}</button>
      </div>
      <div class="tscroll"><table style="min-width:420px"><tbody>${
        rows.map((d, i) => `<tr>
          <td style="color:var(--muted-2);font-family:var(--mono);font-size:11px">${i + 1}</td>
          <td>${esc(d.nama_file)}</td><td>${fmtUkuran(d.ukuran_byte)}</td>
          <td><button class="btn ghost" type="button" data-preview="${d.id}" data-mime="${esc(d.mime_type || '')}" data-fn="${esc(d.nama_file)}" style="padding:4px 7px;font-size:10.5px">${esc(t('docs.preview'))}</button>
            <button class="btn ghost" type="button" data-dl="${d.id}" data-fn="${esc(d.nama_file)}" style="padding:4px 7px;font-size:10.5px">${esc(t('docs.download'))}</button></td>
        </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted-2);padding:12px">${esc(t('lampiran.kosong'))}</td></tr>`
      }</tbody></table></div>`;
    wrap.querySelectorAll('[data-dl]').forEach((b) => {
      b.onclick = () => Api.downloadDocument(b.dataset.dl, b.dataset.fn).catch((e) => toast(e.message || t('docs.downloadFail'), 'error'));
    });
    wrap.querySelectorAll('[data-preview]').forEach((b) => {
      b.onclick = () => bukaPreviewDokumen(b.dataset.preview, b.dataset.mime, b.dataset.fn);
    });
    $('#' + containerId + '_upload').onclick = async () => {
      const fileEl = $('#' + containerId + '_file');
      if (!fileEl.files.length) return toast(t('lampiran.uploadHint.pilih'), 'warning');
      const fd = new FormData();
      fd.append('file', fileEl.files[0]);
      Object.entries(ownerParams).forEach(([k, v]) => fd.append(k, v));
      fd.append('entityType', entityType); fd.append('entityId', entityId);
      try { await Api.uploadDocument(fd); toast(t('docs.uploaded'), 'success'); renderLampiranPanel(containerId, entityType, entityId, ownerParams); }
      catch (e) { toast(e.message || t('docs.uploadHint.fail'), 'error'); }
    };
  } catch (e) { wrap.innerHTML = `<p class="hint">${esc(e.message || t('docs.loadError'))}</p>`; }
}

/* ================================================================
   MODUL MASTER DATA — kelola opsi dropdown (mengganti "isi sendiri")
   Lihat db/17_master_data_opsi.sql. Baca boleh siapa saja login;
   tulis (RLS opsi_master_tulis) hanya Managing Partner/Admin Staf —
   tombolnya sendiri sudah digerbangi lewat visibilitas #modMasterDataBtn
   (lihat enterWorkspace), sama seperti pola Tarif Layanan.
   ================================================================ */
// Dikelompokkan per modul supaya sidebar kedua tidak jadi satu baris
// tombol panjang — urutan grup & isinya SENGAJA sama dengan urutan modul
// di sidebar utama (Perkara, Kontrak, Perizinan, Proyek Legal, Pendampingan).
const GRUP_MASTER_DATA = [
  { grup: 'perkara', kategori: ['cases_tahap', 'cases_peran_klien', 'cases_status_siklus'] },
  { grup: 'kontrak', kategori: ['contracts_status_siklus', 'contracts_jenis_dokumen', 'contracts_relasi_ke_induk'] },
  // 'permit_types' BUKAN kategori opsi_master (lihat db/21) — kodenya
  // tercampur di daftar yang sama supaya tampil berdekatan di sidebar,
  // tapi renderMasterDataPage() menanganinya lewat panel terpisah
  // (#mdPermitTypesPanel), bukan tabel opsi_master generik.
  { grup: 'perizinan', kategori: ['permits_status_siklus', 'permit_types'] },
  { grup: 'proyek', kategori: ['legal_projects_status'] },
  { grup: 'pendampingan', kategori: ['pendampingan_jenis', 'pendampingan_status'] },
];
const KATEGORI_MASTER_DATA = GRUP_MASTER_DATA.flatMap((g) => g.kategori);
const MD = { rows: [], loaded: false, kategoriAktif: KATEGORI_MASTER_DATA[0] };

async function muatMasterDataSemua() {
  showApiErr('');
  try {
    const { rows } = await Api.masterData();
    MD.rows = rows; MD.loaded = true;
    renderMasterDataPage();
  } catch (err) { showApiErr(err.message || t('masterData.loadError')); }
}
function renderMasterDataPage() {
  $('#masterDataTabs').innerHTML = GRUP_MASTER_DATA.map((g) => `
    <div class="md-sidebar-grp">
      <h4>${esc(t('masterData.grup.' + g.grup))}</h4>
      ${g.kategori.map((k) => `
        <button class="${k === MD.kategoriAktif ? 'on' : ''}" data-kat="${k}">${esc(t('masterData.kategori.' + k))}</button>
      `).join('')}
    </div>
  `).join('');
  document.querySelectorAll('#masterDataTabs [data-kat]').forEach((b) => {
    b.onclick = () => { MD.kategoriAktif = b.dataset.kat; renderMasterDataPage(); };
  });
  $('#masterDataKatTitle').textContent = t('masterData.kategori.' + MD.kategoriAktif);

  // 'permit_types' bukan kategori opsi_master (lihat catatan GRUP_MASTER_DATA
  // di atas) — kolomnya beda total (instansi, masa berlaku, KBLI), jadi
  // panel kontennya juga terpisah, bukan tabel generik di bawah ini.
  const pakaiPermitTypes = MD.kategoriAktif === 'permit_types';
  $('#mdOpsiPanel').style.display = pakaiPermitTypes ? 'none' : 'block';
  $('#mdPermitTypesPanel').style.display = pakaiPermitTypes ? 'block' : 'none';
  if (pakaiPermitTypes) {
    if (!PT.loaded) muatPermitTypesSemua(); else renderPermitTypesTable();
    return;
  }

  const baris = MD.rows.filter((r) => r.kategori === MD.kategoriAktif).sort((a, b) => a.urutan - b.urutan);
  $('#masterDataBody').innerHTML = baris.map((r) => `
    <tr data-id="${r.id}" style="${r.aktif ? '' : 'opacity:.5'}">
      <td><span class="doc">${esc(r.kode)}</span></td>
      <td><input class="fld md_labelId" value="${esc(r.label_id)}" style="width:100%"></td>
      <td><input class="fld md_labelEn" value="${esc(r.label_en || '')}" style="width:100%"></td>
      <td><input class="fld md_urutan" type="number" value="${r.urutan}" style="width:70px"></td>
      <td style="text-align:center"><input type="checkbox" class="md_aktif" ${r.aktif ? 'checked' : ''}></td>
      <td><button class="btn ghost md_simpan" style="padding:5px 10px;font-size:11px">${esc(t('common.save'))}</button></td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted-2);padding:16px">${esc(t('masterData.kosong'))}</td></tr>`;

  document.querySelectorAll('#masterDataBody tr[data-id]').forEach((tr) => {
    tr.querySelector('.md_simpan').onclick = async () => {
      const id = tr.dataset.id;
      try {
        await Api.updateMasterDataOption(id, {
          labelId: tr.querySelector('.md_labelId').value.trim(),
          labelEn: tr.querySelector('.md_labelEn').value.trim() || null,
          urutan: Number(tr.querySelector('.md_urutan').value) || 0,
          aktif: tr.querySelector('.md_aktif').checked,
        });
        toast(t('common.saved'), 'success');
        await muatMasterDataUlang();
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
  });
}
async function muatMasterDataUlang() {
  const { rows } = await Api.masterData();
  MD.rows = rows;
  setMasterDataLabels(rows); // supaya label yang baru diubah langsung kepakai di modul lain juga
  renderMasterDataPage();
}
$('#masterDataAddBtn').onclick = async () => {
  const kode = $('#md_new_kode').value.trim();
  const labelId = $('#md_new_labelId').value.trim();
  if (!kode || !labelId) return toast(t('masterData.err.wajib'), 'warning');
  try {
    await Api.createMasterDataOption({
      kategori: MD.kategoriAktif, kode, labelId,
      labelEn: $('#md_new_labelEn').value.trim() || null,
      urutan: MD.rows.filter((r) => r.kategori === MD.kategoriAktif).length,
    });
    $('#md_new_kode').value = ''; $('#md_new_labelId').value = ''; $('#md_new_labelEn').value = '';
    toast(t('common.saved'), 'success');
    await muatMasterDataUlang();
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
};

/* ----------------------------------------------------------------
   JENIS IZIN (permit_types) — bagian Master Data, panel sendiri
   (lihat catatan di GRUP_MASTER_DATA & renderMasterDataPage di atas,
   dan db/21_permit_types_master_data.sql untuk kenapa terpisah dari
   opsi_master).
   ---------------------------------------------------------------- */
const PT = { rows: [], loaded: false, bolehKelola: false };

async function muatPermitTypesSemua() {
  showApiErr('');
  try {
    const { rows, bolehKelola } = await Api.permitTypes();
    PT.rows = rows; PT.bolehKelola = bolehKelola; PT.loaded = true;
    renderPermitTypesTable();
  } catch (err) { showApiErr(err.message || t('permitTypes.loadError')); }
}

function renderPermitTypesTable() {
  $('#permitTypesAddWrap').style.display = PT.bolehKelola ? 'block' : 'none';
  $('#permitTypesBody').innerHTML = PT.rows.map((r) => `
    <tr data-id="${r.id}" style="${r.masih_berlaku ? '' : 'opacity:.5'}">
      <td><span class="doc">${esc(r.kode)}</span></td>
      <td><input class="fld pt_nama" value="${esc(r.nama)}" style="width:100%" ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td><input class="fld pt_instansi" value="${esc(r.instansi || '')}" style="width:100%" ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td><input class="fld pt_masaBerlaku" type="number" min="0" value="${r.masa_berlaku_bulan ?? ''}" style="width:80px" ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td><input class="fld pt_kbli" value="${esc((r.kbli_terkait || []).join(', '))}" style="width:100%" placeholder="${esc(t('permitTypes.f.kbliPlaceholder'))}" ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td style="text-align:center"><input type="checkbox" class="pt_wajib" ${r.wajib ? 'checked' : ''} ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td style="text-align:center"><input type="checkbox" class="pt_aktif" ${r.masih_berlaku ? 'checked' : ''} ${PT.bolehKelola ? '' : 'disabled'}></td>
      <td>${PT.bolehKelola ? `<button class="btn ghost pt_simpan" style="padding:5px 10px;font-size:11px">${esc(t('common.save'))}</button>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted-2);padding:16px">${esc(t('permitTypes.kosong'))}</td></tr>`;

  document.querySelectorAll('#permitTypesBody tr[data-id]').forEach((tr) => {
    const btn = tr.querySelector('.pt_simpan');
    if (!btn) return;
    btn.onclick = async () => {
      const id = tr.dataset.id;
      const kbli = tr.querySelector('.pt_kbli').value.split(',').map((s) => s.trim()).filter(Boolean);
      try {
        await Api.updatePermitType(id, {
          nama: tr.querySelector('.pt_nama').value.trim(),
          instansi: tr.querySelector('.pt_instansi').value.trim() || null,
          masaBerlakuBulan: tr.querySelector('.pt_masaBerlaku').value ? Number(tr.querySelector('.pt_masaBerlaku').value) : null,
          kbliTerkait: kbli,
          wajib: tr.querySelector('.pt_wajib').checked,
          masihBerlaku: tr.querySelector('.pt_aktif').checked,
        });
        toast(t('common.saved'), 'success');
        PT.loaded = false;
        await muatPermitTypesSemua();
      } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
    };
  });
}

$('#permitTypesAddBtn').onclick = async () => {
  const kode = $('#pt_new_kode').value.trim();
  const nama = $('#pt_new_nama').value.trim();
  if (!kode || !nama) return toast(t('permitTypes.err.wajib'), 'warning');
  const kbli = $('#pt_new_kbli').value.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    await Api.createPermitType({
      kode, nama,
      instansi: $('#pt_new_instansi').value.trim() || null,
      masaBerlakuBulan: $('#pt_new_masaBerlaku').value ? Number($('#pt_new_masaBerlaku').value) : null,
      kbliTerkait: kbli,
      wajib: $('#pt_new_wajib').checked,
    });
    $('#pt_new_kode').value = ''; $('#pt_new_nama').value = ''; $('#pt_new_instansi').value = '';
    $('#pt_new_masaBerlaku').value = ''; $('#pt_new_kbli').value = ''; $('#pt_new_wajib').checked = false;
    toast(t('common.saved'), 'success');
    PT.loaded = false;
    await muatPermitTypesSemua();
  } catch (e) { toast(e.message || t('common.saveFailed'), 'error'); }
};
