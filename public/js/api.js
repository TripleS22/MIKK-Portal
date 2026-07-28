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

    permits: (clientOrgId) => call('/permits', { qs: { clientOrgId } }),
    permitsDashboard: (clientOrgId) => call('/permits/dashboard', { qs: { clientOrgId } }),
    permitGap: (clientOrgId) => call('/permits/gap', { qs: { clientOrgId } }),
    permitReference: (clientOrgId) => call('/permits/reference', { qs: { clientOrgId } }),
    getPermit: (id) => call(`/permits/one/${id}`),
    createPermit: (body) => call('/permits', { method: 'POST', body }),
    updatePermit: (id, body) => call(`/permits/${id}`, { method: 'PATCH', body }),

    cases: (clientOrgId) => call('/cases', { qs: { clientOrgId } }),
    casesDashboard: (clientOrgId) => call('/cases/dashboard', { qs: { clientOrgId } }),
    casesReference: (clientOrgId) => call('/cases/reference', { qs: { clientOrgId } }),
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

    documents: (clientOrgId) => call('/documents', { qs: { clientOrgId } }),
    uploadDocument: async (formData) => {
      const headers = {};
      if (token()) headers.Authorization = 'Bearer ' + token();
      const res = await fetch(BASE + '/documents', { method: 'POST', headers, body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'Gagal mengunggah.');
      return data;
    },
    downloadDocument: async (id, filenameFallback) => {
      const headers = {};
      if (token()) headers.Authorization = 'Bearer ' + token();
      const res = await fetch(BASE + `/documents/${id}/download`, { headers });
      if (!res.ok) { const d = await res.json().catch(() => null); throw new Error((d && d.error) || 'Gagal mengunduh.'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filenameFallback || 'dokumen';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
})();
