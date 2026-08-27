/* =====================================================================
   MIKK Client Portal — pembungkus panggilan API
   Token disimpan di localStorage. Untuk produksi, pertimbangkan cookie
   httpOnly agar token tidak terjangkau JavaScript pihak ketiga (proteksi
   XSS) — dicatat sebagai peningkatan lanjutan, bukan blokir Fase 1.
   ===================================================================== */
const Api = (() => {
  const BASE = '/api';
  let onUnauthorized = () => {};

  function token() { return localStorage.getItem('mikk_token'); }
  function setToken(t) { t ? localStorage.setItem('mikk_token', t) : localStorage.removeItem('mikk_token'); }

  /* Diambil terpisah dari downloadDocument supaya bisa dipakai ulang oleh
     pratinjau (buka di modal, bukan dipaksa unduh) tanpa endpoint baru —
     server/routes/documents.routes.js hanya punya satu jalur baca berkas,
     yang sudah lebih dulu ditanya lewat RLS. */
  async function fetchDocumentBlob(id) {
    const headers = {};
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(BASE + `/documents/${id}/download`, { headers });
    if (!res.ok) { const d = await res.json().catch(() => null); throw new Error((d && d.error) || 'Gagal memuat dokumen.'); }
    return res.blob();
  }

  async function call(path, { method = 'GET', body, qs } = {}) {
    let url = BASE + path;
    if (qs) {
      const p = new URLSearchParams();
      Object.entries(qs).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
      const s = p.toString();
      if (s) url += '?' + s;
    }
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();

    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) { /* respons kosong */ }

    if (res.status === 401) { setToken(null); onUnauthorized(); }
    if (!res.ok) { const err = new Error((data && data.error) || `Permintaan gagal (${res.status})`); err.status = res.status; throw err; }
    return data;
  }

  return {
    setUnauthorizedHandler(fn) { onUnauthorized = fn; },
    isLoggedIn: () => !!token(),
    logout: () => setToken(null),

    login: (email, password) => call('/auth/login', { method: 'POST', body: { email, password } })
      .then((d) => { setToken(d.token); return d; }),
    me: () => call('/auth/me'),
    workspaces: () => call('/auth/workspaces'),
    clientOrgs: () => call('/client-orgs'),

    dashboard: (clientOrgId) => call('/contracts/dashboard', { qs: { clientOrgId } }),
    ledger: (clientOrgId) => call('/contracts/ledger', { qs: { clientOrgId } }),
    reference: (clientOrgId) => call('/contracts/reference', { qs: { clientOrgId } }),
    listContracts: (params) => call('/contracts', { qs: params }),
    getContract: (id) => call(`/contracts/one/${id}`),
    createContract: (body) => call('/contracts', { method: 'POST', body }),
    updateContract: (id, body) => call(`/contracts/${id}`, { method: 'PATCH', body }),

    checkConflict: (nama, clientOrgId) => call('/counterparties/check-conflict', { method: 'POST', body: { nama, clientOrgId } }),

    /* ---- Fase 3: corong calon klien ----
       registerProspect menyimpan token sendiri, sama seperti login: begitu
       pendaftaran berhasil orangnya memang sudah masuk. */
    registerProspect: (body) => call('/prospects/register', { method: 'POST', body })
      .then((d) => { setToken(d.token); return d; }),
    prospectMe: () => call('/prospects/me'),
    consultRates: () => call('/prospects/rates'),
    consultations: () => call('/prospects/consultations'),
    createConsultation: (body) => call('/prospects/consultations', { method: 'POST', body }),
    createBooking: (id, body) => call(`/prospects/consultations/${id}/booking`, { method: 'POST', body }),
    previewCoupon: (body) => call('/prospects/coupons/preview', { method: 'POST', body }),

    /* ---- Tarif layanan (hanya Managing Partner yang boleh mengubah) ---- */
    serviceRates: () => call('/service-rates'),
    createRate: (body) => call('/service-rates', { method: 'POST', body }),
    updateRate: (id, body) => call(`/service-rates/${id}`, { method: 'PATCH', body }),

    /* ---- Akun pengguna sisi klien ---- */
    clientUsers: (clientOrgId) => call('/client-users', { qs: { clientOrgId } }),
    createClientUser: (body) => call('/client-users', { method: 'POST', body }),
    updateClientUser: (id, body) => call(`/client-users/${id}`, { method: 'PATCH', body }),
    resetClientPassword: (userId) => call(`/client-users/${userId}/reset-password`, { method: 'POST' }),

    /* ---- Akun staf MIKK (admin & PIC/legal) ---- */
    staffUsers: () => call('/staff-users'),
    createStaffUser: (body) => call('/staff-users', { method: 'POST', body }),
    updateStaffUser: (userId, body) => call(`/staff-users/${userId}`, { method: 'PATCH', body }),
    resetStaffPassword: (userId) => call(`/staff-users/${userId}/reset-password`, { method: 'POST' }),

    permits: (clientOrgId) => call('/permits', { qs: { clientOrgId } }),
    permitsDashboard: (clientOrgId) => call('/permits/dashboard', { qs: { clientOrgId } }),
    permitGap: (clientOrgId) => call('/permits/gap', { qs: { clientOrgId } }),
    permitReference: (clientOrgId) => call('/permits/reference', { qs: { clientOrgId } }),
    getPermit: (id) => call(`/permits/one/${id}`),
    createPermit: (body) => call('/permits', { method: 'POST', body }),
    updatePermit: (id, body) => call(`/permits/${id}`, { method: 'PATCH', body }),

    // Sama seperti documents(): string = clientOrgId lama, objek = pilih salah
    // satu dari clientOrgId/individualClientId/clientGroupId (lihat
    // server/routes/cases.routes.js — perkara kini bisa dimiliki tiga jenis pihak).
    cases: (owner) => call('/cases', { qs: typeof owner === 'string' ? { clientOrgId: owner } : owner }),
    casesDashboard: (clientOrgId) => call('/cases/dashboard', { qs: { clientOrgId } }),
    casesReference: (owner) => call('/cases/reference', { qs: typeof owner === 'string' ? { clientOrgId: owner } : owner }),
    getCase: (id) => call(`/cases/one/${id}`),
    createCase: (body) => call('/cases', { method: 'POST', body }),
    updateCase: (id, body) => call(`/cases/${id}`, { method: 'PATCH', body }),
    addHearing: (caseId, body) => call(`/cases/${caseId}/hearings`, { method: 'POST', body }),
    updateHearing: (id, body) => call(`/cases/hearings/${id}`, { method: 'PATCH', body }),
    addMinute: (caseId, body) => call(`/cases/${caseId}/minutes`, { method: 'POST', body }),

    projects: (clientOrgId) => call('/legal-projects', { qs: { clientOrgId } }),
    projectsDashboard: (clientOrgId) => call('/legal-projects/dashboard', { qs: { clientOrgId } }),
    projectsReference: (clientOrgId) => call('/legal-projects/reference', { qs: { clientOrgId } }),
    createProject: (body) => call('/legal-projects', { method: 'POST', body }),
    updateProject: (id, body) => call(`/legal-projects/${id}`, { method: 'PATCH', body }),

    pendampingan: (clientOrgId) => call('/pendampingan', { qs: { clientOrgId } }),
    pendampinganReference: (clientOrgId) => call('/pendampingan/reference', { qs: { clientOrgId } }),
    createPendampingan: (body) => call('/pendampingan', { method: 'POST', body }),
    updatePendampingan: (id, body) => call(`/pendampingan/${id}`, { method: 'PATCH', body }),

    // Menerima string (clientOrgId lama, dipertahankan demi kompatibilitas)
    // ATAU sebuah objek { clientOrgId | individualClientId | clientGroupId,
    // entityType?, entityId? } — dokumen sekarang bisa melekat ke salah satu
    // dari tiga jenis pemilik (lihat server/routes/documents.routes.js).
    documents: (owner) => call('/documents', { qs: typeof owner === 'string' ? { clientOrgId: owner } : owner }),
    uploadDocument: async (formData) => {
      const headers = {};
      if (token()) headers.Authorization = 'Bearer ' + token();
      const res = await fetch(BASE + '/documents', { method: 'POST', headers, body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'Gagal mengunggah.');
      return data;
    },
    downloadDocument: async (id, filenameFallback) => {
      const blob = await fetchDocumentBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filenameFallback || 'dokumen';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    // Dipakai tombol "Pratinjau": kembalikan blob-nya saja, pemanggil yang
    // memutuskan cara menampilkannya (<img>/<iframe>) lewat URL.createObjectURL.
    previewDocumentBlob: (id) => fetchDocumentBlob(id),

    /* ---- Klien perorangan & kelompok (bareng-bareng) ---- */
    individualClients: () => call('/individual-clients'),
    createIndividualClient: (body) => call('/individual-clients', { method: 'POST', body }),
    clientGroups: () => call('/client-groups'),
    createClientGroup: (body) => call('/client-groups', { method: 'POST', body }),

    /* ---- Dashboard pribadi lintas klien ("Perkara Saya") ---- */
    myCases: () => call('/my/cases'),
    mySummary: () => call('/my/summary'),

    /* ---- Profil per peran ---- */
    profileMe: () => call('/profile/me'),
    updateProfileMe: (body) => call('/profile/me', { method: 'PATCH', body }),
    profileProjects: () => call('/profile/me/projects'),

    /* ---- Master Data (opsi dropdown terkelola) ---- */
    masterData: (kategori) => call('/master-data', { qs: kategori ? { kategori } : undefined }),
    createMasterDataOption: (body) => call('/master-data', { method: 'POST', body }),
    updateMasterDataOption: (id, body) => call(`/master-data/${id}`, { method: 'PATCH', body }),

    /* ---- Jenis Izin (permit_types) — bagian Master Data, tabel sendiri
       karena kolomnya beda dari opsi_master (lihat db/21). ---- */
    permitTypes: () => call('/permit-types'),
    createPermitType: (body) => call('/permit-types', { method: 'POST', body }),
    updatePermitType: (id, body) => call(`/permit-types/${id}`, { method: 'PATCH', body }),

    /* ---- Profil perusahaan (client_orgs) ---- */
    getClientOrg: (id) => call(`/client-orgs/${id}`),
    updateClientOrg: (id, body) => call(`/client-orgs/${id}`, { method: 'PATCH', body }),

    /* ---- Pratinjau Office (Google Docs Viewer / MS Office Online) ---- */
    createPreviewLink: (id) => call(`/documents/${id}/preview-link`, { method: 'POST' }),
  };
})();
