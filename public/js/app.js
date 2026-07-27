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

const PERAN_LABEL = nameProxy('peran');
const STATUS_NAMA = nameProxy('status');
const SIKLUS_NAMA = nameProxy('siklus');
const RELASI_NAMA = nameProxy('relasi');
const ROWS_LEDGER = () => [t('kontrak.row.nomor'), t('kontrak.row.lawan'), t('kontrak.row.mulai'), t('kontrak.row.akhir'), t('kontrak.row.nilai')];
const STATUS_KEYS = ['aman', 'pantau', 'peringatan', 'kritis', 'kedaluwarsa', 'digantikan', 'tanpa_batas', 'tidak_dipantau'];
const PERMIT_STATUS_NAMA = nameProxy('permitStatus');

const S = {
  user: null, ws: null, wsList: [],
  q: '', kat: '', stat: '', lengkap: '', sort: 'skor', dir: 'asc', page: 1, per: 15,
  view: 'table', ledRow: null,
  reference: null, ledger: [], list: { rows: [], total: 0 },
  editing: null, draft: null, err: null,
  quickQueue: [], quickIdx: 0,
};

/* ---------------------------------------------------------------- toast */
let tt;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600);
}
function showApiErr(msg) {
  const el = $('#apiErr'); if (!el) return;
  el.textContent = msg; el.classList.toggle('on', !!msg);
}

/* ---------------------------------------------------------------- alur masuk */
Api.setUnauthorizedHandler(() => { S.user = null; S.ws = null; goLogin(); });

function goLogin() {
  $('#screenLogin').style.display = 'flex';
  $('#screenWorkspace').style.display = 'none';
  $('#screenApp').style.display = 'none';
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
  $('#wsGrid').innerHTML = list.map((w, i) => `
    <button class="wscard" data-i="${i}">
      <div class="role">${esc(PERAN_LABEL[w.peran] || w.peran)}</div>
      <h3>${esc(w.nama_singkat)}</h3>
      <p>${esc(w.nama_legal)}</p>
    </button>`).join('');
  document.querySelectorAll('.wscard').forEach((b) => {
    b.onclick = () => enterWorkspace(list[Number(b.dataset.i)]);
  });
}

async function enterWorkspace(ws) {
  S.ws = ws;
  $('#screenLogin').style.display = 'none';
  $('#screenWorkspace').style.display = 'none';
  $('#screenApp').style.display = 'block';
  $('#switchWsBtn').style.display = S.wsList.length > 1 ? 'inline-flex' : 'none';

  const me = await Api.me();
  S.user = me.user;
  $('#whoName').textContent = S.user.nama;
  $('#whoRole').textContent = `${PERAN_LABEL[ws.peran] || ws.peran} · ${ws.nama_singkat}`;
  $('#avInit').textContent = S.user.nama.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

  await muatSemua();
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
const tglTampil = (iso) => !iso ? null : new Date(iso + 'T00:00:00')
  .toLocaleDateString(LANG === 'en' ? 'en-GB' : 'id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const sisaTeks = (d) => d < 0 ? t('common.daysAgo', { n: Math.abs(d) }) : t('common.daysLeft', { n: d });

/* ---------------------------------------------------------------- render: hero + kartu */
function renderHero() {
  $('#heroDesc').textContent = t('kontrak.heroDesc');
  $('#pctSub').textContent = t('kontrak.pctSub');
  const d = S.dashboard || {};
  const pct = Number(d.kelengkapan_persen) || 0;
  $('#pctBig').textContent = pct.toFixed ? Math.round(pct) : pct;

  $('#ledLabels').innerHTML = ROWS_LEDGER().map((r, i) =>
    `<button data-row="${i}" class="${S.ledRow === i ? 'on' : ''}">${esc(r)}</button>`).join('');
  const FIELD_KEYS = ['f_nomor', 'f_lawan', 'f_mulai', 'f_akhir', 'f_nilai'];
  $('#ledGrid').innerHTML = S.ledger.map((c) =>
    FIELD_KEYS.map((k, i) =>
      `<button class="cell ${c[k] ? 'f' : 'e'}" data-id="${c.id}" data-row="${i}" aria-label="${esc(c.judul)}"></button>`
    ).join('')
  ).join('');
}
function ledCap(idOrNull, row) {
  const L = $('#ledCap');
  if (!idOrNull) { L.innerHTML = ''; return; }
  const c = S.ledger.find((x) => x.id === idOrNull);
  L.innerHTML = c ? `<b>${esc(c.judul)}</b> · ${esc(ROWS_LEDGER()[row])}` : '';
}
function renderCards() {
  const d = S.dashboard || {};
  const item = (k, v, cls, note) => `<div class="card ${cls}"><div class="k">${esc(k)}</div>
    <div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#cards').innerHTML = [
    item(t('kontrak.card.total'), d.total_kontrak ?? 0, '', t('kontrak.card.total.note')),
    item(t('kontrak.card.aktif'), d.kontrak_aktif ?? 0, 'acc-ok', t('kontrak.card.aktif.note')),
    item(t('kontrak.card.akanBerakhir'), d.akan_berakhir_90h ?? 0, 'acc-warn', t('kontrak.card.akanBerakhir.note')),
    item(t('kontrak.card.kedaluwarsa'), d.kedaluwarsa ?? 0, 'acc-crit', t('kontrak.card.kedaluwarsa.note')),
    item(t('kontrak.card.diperpanjang'), d.sudah_diperpanjang ?? 0, 'acc-repl', t('kontrak.card.diperpanjang.note')),
    item(t('kontrak.card.nilai'), rupiah(d.total_nilai), '', t('kontrak.card.nilai.note', { n: d.jumlah_bernilai ?? 0 })),
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
function formHTML(c, err) {
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
    <textarea id="i_ket" rows="3">${esc(d.keterangan || '')}</textarea></div>`;
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
function bukaDrawer(row) {
  drawerRow = row; S.editing = row.id; S.draft = draftDariBaris(row);
  gambarDrawer();
  $('#veil').classList.add('on'); $('#drawer').classList.add('on');
  if (S.draft.lawanPihakNama) {
    Api.checkConflict(S.draft.lawanPihakNama, S.ws.client_org_id).then(renderConflictBox).catch(() => {});
  }
  setTimeout(() => { const el = $('#i_nomor'); if (el) el.focus(); }, 60);
}
function gambarDrawer(err) {
  $('#dTitle').textContent = t('kontrak.drawerTitle');
  $('#dBody').innerHTML = formHTML(drawerRow, err);
  pasangFormEvent(() => gambarDrawer());
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
    toast(t('common.saved'));
  } catch (e) {
    gambarDrawer({ _umum: e.message });
    toast(e.message || t('common.saveFailed'));
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
    ${formHTML(c, err)}
    <div class="qnav">
      <button class="btn ghost" id="qPrev" ${S.quickIdx === 0 ? 'disabled' : ''}>${t('kontrak.quick.prev')}</button>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="qSkip">${t('kontrak.quick.skip')}</button>
        <button class="btn gold" id="qNext">${t('kontrak.quick.next')}</button>
      </div>
    </div>`;
  pasangFormEvent(() => gambarQuick(q, c));
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
      toast(t('common.saved'));
      renderCards(); renderHero(); renderQuick();
    } catch (e) { toast(e.message || t('common.saveFailed')); btn.disabled = false; btn.innerHTML = t('kontrak.quick.next'); }
  };
}

/* ---------------------------------------------------------------- render utama */
function render() {
  renderHero(); renderCards();
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
    await Api.login($('#email').value.trim(), $('#password').value);
    await goWorkspacePicker();
  } catch (err) {
    errEl.textContent = err.message || t('login.genericError'); errEl.classList.add('on');
  } finally { btn.disabled = false; btn.textContent = t('login.submit'); }
});

$('#logoutBtn').onclick = () => { Api.logout(); S.user = null; S.ws = null; goLogin(); };
$('#switchWsBtn').onclick = () => {
  $('#screenApp').style.display = 'none';
  $('#screenWorkspace').style.display = 'flex';
  $('#wsGrid').innerHTML = S.wsList.map((w, i) => `
    <button class="wscard" data-i="${i}">
      <div class="role">${esc(PERAN_LABEL[w.peran] || w.peran)}</div>
      <h3>${esc(w.nama_singkat)}</h3><p>${esc(w.nama_legal)}</p>
    </button>`).join('');
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
  if (row) bukaDrawer(row);
};
document.querySelectorAll('thead th.srt').forEach((th) => {
  th.onclick = () => {
    const s = th.dataset.s;
    if (S.sort === s) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = s; S.dir = 'asc'; }
    terapkanFilterLaluRender();
  };
});
$('#ledGrid').onclick = async (e) => {
  const b = e.target.closest('button[data-id]'); if (!b) return;
  try {
    const { row } = await Api.getContract(b.dataset.id);
    bukaDrawer(row);
  } catch (err) { toast(err.message || t('kontrak.openError')); }
};
$('#ledGrid').onmouseover = (e) => { const b = e.target.closest('button[data-id]'); if (b) ledCap(b.dataset.id, Number(b.dataset.row)); };
$('#ledGrid').onmouseleave = () => ledCap(null);
$('#ledLabels').onclick = (e) => {
  const b = e.target.closest('button[data-row]'); if (!b) return;
  const r = Number(b.dataset.row);
  S.ledRow = S.ledRow === r ? null : r;
  S.view = 'quick'; S.quickIdx = 0; S.draft = null;
  render();
};
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
  const item = (k, v, cls, note) => `<div class="card ${cls}"><div class="k">${esc(k)}</div>
    <div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#permitCards').innerHTML = [
    item(t('permits.card.total'), d.total_izin ?? 0, '', t('permits.card.total.note')),
    item(t('permits.card.aktif'), d.izin_aktif ?? 0, 'acc-ok', t('permits.card.aktif.note')),
    item(t('permits.card.akanBerakhir'), d.akan_berakhir ?? 0, 'acc-warn', t('permits.card.akanBerakhir.note')),
    item(t('permits.card.kedaluwarsa'), d.kedaluwarsa ?? 0, 'acc-crit', t('permits.card.kedaluwarsa.note')),
    item(t('permits.card.pengurusan'), d.dalam_pengurusan ?? 0, '', t('permits.card.pengurusan.note')),
    item(t('permits.card.gap'), d.gap_wajib ?? 0, d.gap_wajib > 0 ? 'acc-crit' : 'acc-ok', t('permits.card.gap.note')),
  ].join('');
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
      <td>${pic ? esc(pic.nama) : '<span style="color:var(--muted-2)">—</span>'}</td>
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
    <select id="p_status">${permitOpsi(r.statusSiklus.map((v) => ({ v, l: PERMIT_STATUS_NAMA[v] || v })), d.status, t('common.none'))}</select></div>
  <div class="f" style="margin-top:12px"><label>${t('permits.f.keterangan')}</label><textarea id="p_ket" rows="3">${esc(d.keterangan || '')}</textarea></div>`;
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
    toast(t('common.saved'));
  } catch (e) {
    gambarPermitDrawer({ _umum: e.message });
    toast(e.message || t('common.saveFailed'));
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
const MODULES = ['kontrak', 'permits', 'cases', 'projects', 'pendampingan', 'docs'];
function switchModuleAll(mod) {
  tutupDrawer(); tutupPermitDrawer(); tutupAuxDrawer();
  MODULES.forEach((m) => {
    const el = $('#sec' + { kontrak: 'Kontrak', permits: 'Permits', cases: 'Cases',
      projects: 'Projects', pendampingan: 'Pendampingan', docs: 'Docs' }[m]);
    if (el) el.style.display = m === mod ? 'block' : 'none';
  });
  ['modKontrakBtn', 'modPermitsBtn', 'modCasesBtn', 'modProjectsBtn', 'modPendampinganBtn', 'modDocsBtn']
    .forEach((id, i) => $('#' + id).classList.toggle('on', MODULES[i] === mod));
  if (mod === 'permits' && !P.loaded) muatPermitsSemua();
  if (mod === 'cases' && !CS.loaded) muatCasesSemua();
  if (mod === 'projects' && !PJ.loaded) muatProjectsSemua();
  if (mod === 'pendampingan' && !PD.loaded) muatPendampinganSemua();
  if (mod === 'docs' && !DC.loaded) muatDocsSemua();
}
$('#modKontrakBtn').onclick = () => switchModuleAll('kontrak');
$('#modPermitsBtn').onclick = () => switchModuleAll('permits');
$('#modCasesBtn').onclick = () => switchModuleAll('cases');
$('#modProjectsBtn').onclick = () => switchModuleAll('projects');
$('#modPendampinganBtn').onclick = () => switchModuleAll('pendampingan');
$('#modDocsBtn').onclick = () => switchModuleAll('docs');

/* ---------------------------------------------------------------- drawer generik */
let auxKind = null; // 'case' | 'project' | 'pendampingan'
function bukaAuxDrawer(kind, judul, bodyHtml, onSave) {
  auxKind = kind;
  $('#auxDTitle').textContent = judul;
  $('#auxDBody').innerHTML = bodyHtml;
  $('#auxDSave').onclick = onSave;
  $('#veil').classList.add('on'); $('#auxDrawer').classList.add('on');
}
function tutupAuxDrawer() {
  auxKind = null;
  $('#veil').classList.remove('on'); $('#auxDrawer').classList.remove('on');
}
$('#auxDClose').onclick = tutupAuxDrawer; $('#auxDCancel').onclick = tutupAuxDrawer;

const TAHAP_NAMA = nameProxy('tahap');
const PERAN_KLIEN_NAMA = nameProxy('peranKlien');
const CASE_STATUS_NAMA = nameProxy('caseStatus');

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
  const item = (k, v, cls, note) => `<div class="card ${cls}"><div class="k">${esc(k)}</div>
    <div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#caseCards').innerHTML = [
    item(t('cases.card.aktif'), d.perkara_aktif ?? 0, '', t('cases.card.aktif.note')),
    item(t('cases.card.sidangHariIni'), d.sidang_hari_ini ?? 0, 'acc-warn', t('cases.card.sidangHariIni.note')),
    item(t('cases.card.sidang7hari'), d.sidang_7_hari ?? 0, 'acc-warn', t('cases.card.sidang7hari.note')),
    item(t('cases.card.tahapTinggi'), d.tahap_tertinggi ?? 0, '', t('cases.card.tahapTinggi.note')),
  ].join('');
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
      <td>${pic ? esc(pic.nama) : '<span style="color:var(--muted-2)">—</span>'}</td>
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
  if (id) {
    $('#cs_h_add').onclick = async () => {
      const tgl = $('#cs_h_tgl').value, jam = $('#cs_h_jam').value, agenda = $('#cs_h_agenda').value;
      if (!tgl) return toast(t('cases.err.tglSidang'));
      try { await Api.addHearing(id, { tanggalSidang: tgl, jamSidang: jam || null, agenda: agenda || null });
        toast(t('cases.hearingAdded')); await bukaCaseDrawer(id); await muatCasesSemua();
      } catch (e) { toast(e.message); }
    };
    $('#cs_m_add').onclick = async () => {
      const isi = $('#cs_m_isi').value.trim();
      if (!isi) return toast(t('cases.err.isiCatatan'));
      try { await Api.addMinute(id, { isi, status: 'final' });
        toast(t('cases.minuteAdded')); await bukaCaseDrawer(id);
      } catch (e) { toast(e.message); }
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
  if (!body.nomorPerkara) return toast(t('cases.err.nomor'));
  try {
    if (CS.editing) await Api.updateCase(CS.editing, body);
    else await Api.createCase({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatCasesSemua(); toast(t('common.saved'));
  } catch (e) { toast(e.message || t('common.saveFailed')); }
}
$('#addCaseBtn').onclick = () => bukaCaseDrawer(null);

/* ================================================================
   MODUL PROYEK LEGAL
   ================================================================ */
const PJ = { rows: [], ref: null, dashboard: null, loaded: false, editing: null };
const PROJECT_STATUS_NAMA = nameProxy('projStatus');
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
  const item = (k, v, cls, note) => `<div class="card ${cls}"><div class="k">${esc(k)}</div>
    <div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#projectCards').innerHTML = [
    item(t('projects.card.total'), d.total_proyek ?? 0, '', t('projects.card.total.note')),
    item(t('projects.card.berjalan'), d.berjalan ?? 0, 'acc-ok', t('projects.card.berjalan.note')),
    item(t('projects.card.segeraSelesai'), d.segera_selesai ?? 0, 'acc-warn', t('projects.card.segeraSelesai.note')),
    item(t('projects.card.terlambat'), d.terlambat ?? 0, 'acc-crit', t('projects.card.terlambat.note')),
    item(t('projects.card.selesai'), d.selesai ?? 0, '', t('projects.card.selesai.note')),
  ].join('');
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
      <td><div class="meter" title="${p.progress_persen}%">${[0,20,40,60,80].map((n) => `<i class="${p.progress_persen > n ? 'f' : ''}"></i>`).join('')}<span style="font-size:11px;margin-left:5px;color:var(--muted)">${p.progress_persen}%</span></div></td>
      <td>${p.target_selesai ? esc(tglTampil(p.target_selesai)) : '—'}</td>
      <td>${sisa}</td>
      <td><span class="pill p-${p.status_waktu === 'terlambat' ? 'kritis' : p.status_waktu === 'segera_selesai' ? 'peringatan' : p.status === 'selesai' ? 'aman' : 'pantau'}">${esc(PROJECT_SW_NAMA[p.status_waktu] || PROJECT_STATUS_NAMA[p.status])}</span></td>
      <td>${pic ? esc(pic.nama) : '<span style="color:var(--muted-2)">—</span>'}</td>
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
  <div class="f" style="margin-top:12px"><label>${t('projects.f.keterangan')}</label><textarea id="pj_ket" rows="3">${esc(row?.keterangan || '')}</textarea></div>`;
}
async function bukaProjectDrawer(row) {
  PJ.editing = row ? row.id : null;
  bukaAuxDrawer('project', row ? t('projects.drawerTitle') : t('projects.drawerTitleNew'), projectFormHTML(row), simpanProject);
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
  if (!body.namaProyek) return toast(t('projects.err.nama'));
  try {
    if (PJ.editing) await Api.updateProject(PJ.editing, body);
    else await Api.createProject({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatProjectsSemua(); toast(t('common.saved'));
  } catch (e) { toast(e.message || t('common.saveFailed')); }
}
$('#addProjectBtn').onclick = () => bukaProjectDrawer(null);

/* ================================================================
   MODUL HUB PENDAMPINGAN
   ================================================================ */
const PD = { rows: [], ref: null, loaded: false, editing: null };
const JENIS_PD_NAMA = nameProxy('jenisPd');
const STATUS_PD_NAMA = nameProxy('statusPd');

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
  const item = (k, v, cls, note) => `<div class="card ${cls}"><div class="k">${esc(k)}</div>
    <div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#pendampinganCards').innerHTML = [
    item(t('pendampingan.card.total'), PD.rows.length, '', t('pendampingan.card.total.note')),
    item(t('pendampingan.card.menunggu'), n('menunggu'), 'acc-warn', t('pendampingan.card.menunggu.note')),
    item(t('pendampingan.card.diproses'), n('diproses'), '', t('pendampingan.card.diproses.note')),
    item(t('pendampingan.card.selesai'), n('selesai'), 'acc-ok', t('pendampingan.card.selesai.note')),
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
      <td>${r.pic_nama ? esc(r.pic_nama) : '<span style="color:var(--muted-2)">—</span>'}</td>
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
  </div>`;
}
async function bukaPendampinganDrawer(row) {
  PD.editing = row ? row.id : null;
  bukaAuxDrawer('pendampingan', row ? t('pendampingan.drawerTitle') : t('pendampingan.drawerTitleNew'), pendampinganFormHTML(row), simpanPendampingan);
}
async function simpanPendampingan() {
  const body = {
    jenis: $('#pd_jenis').value, tanggalKegiatan: $('#pd_tanggal').value || null,
    lokasi: $('#pd_lokasi').value.trim() || null, pihakTerlibat: $('#pd_pihak').value.trim() || null,
    deskripsi: $('#pd_deskripsi').value.trim() || null, status: $('#pd_status').value,
    picId: $('#pd_pic').value || null,
  };
  if (!body.jenis) return toast(t('pendampingan.err.jenis'));
  try {
    if (PD.editing) await Api.updatePendampingan(PD.editing, body);
    else await Api.createPendampingan({ ...body, clientOrgId: S.ws.client_org_id });
    tutupAuxDrawer(); await muatPendampinganSemua(); toast(t('common.saved'));
  } catch (e) { toast(e.message || t('common.saveFailed')); }
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
  const item = (k, v, note) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="n">${esc(note)}</div></div>`;
  $('#docCards').innerHTML = [
    item(t('docs.card.total'), DC.rows.length, t('docs.card.total.note')),
    item(t('docs.card.ukuran'), fmtUkuran(totalBytes), t('docs.card.ukuran.note')),
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
      <td><button class="btn ghost" data-dl="${d.id}" data-fn="${esc(d.nama_file)}" style="padding:5px 10px;font-size:11px">${t('docs.download')}</button></td>
    </tr>`).join('');
  document.querySelectorAll('#docBody button[data-dl]').forEach((btn) => {
    btn.onclick = async () => {
      try { await Api.downloadDocument(btn.dataset.dl, btn.dataset.fn); }
      catch (e) { toast(e.message || t('docs.downloadFail')); }
    };
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
    await muatDocsSemua(); toast(t('docs.uploaded'));
  } catch (e) { hint.textContent = e.message || t('docs.uploadHint.fail'); }
};

/* ---------------------------------------------------------------- bahasa */
$('#langBtn').onclick = () => {
  const next = LANG === 'en' ? 'id' : 'en';
  setLang(next);
};
onLangChange((lang) => {
  $('#langBtnLabel').textContent = lang.toUpperCase();
  applyStaticI18n();
  if (!S.ws) return;
  isiSelectReferensi();
  $('#fKat').value = S.kat; $('#fStat').value = S.stat;
  $('#fLengkap').innerHTML = `<option value="">${esc(t('kontrak.filter.allLengkap'))}</option>
    <option value="belum">${esc(t('kontrak.filter.belum'))}</option><option value="sudah">${esc(t('kontrak.filter.sudah'))}</option>`;
  $('#fLengkap').value = S.lengkap;
  $('#q').value = S.q;
  render();
  if (P.loaded) { renderPermitCards(); renderPermitTable(); renderGap(); }
  if (CS.loaded) { renderCaseCards(); renderCaseTable(); }
  if (PJ.loaded) { renderProjectCards(); renderProjectTable(); }
  if (PD.loaded) { renderPendampinganCards(); renderPendampinganTable(); }
  if (DC.loaded) { renderDocCards(); renderDocTable(); }
});

/* ---------------------------------------------------------------- mulai */
(async () => {
  applyStaticI18n();
  $('#langBtnLabel').textContent = LANG.toUpperCase();
  if (Api.isLoggedIn()) {
    try { await goWorkspacePicker(); } catch (e) { goLogin(); }
  } else {
    goLogin();
  }
})();
