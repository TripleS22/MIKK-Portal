// server/lib/email.js
//
// Pengiriman email transaksional lewat Resend (https://resend.com) — API
// HTTP biasa (fetch), BUKAN SMTP: SMTP butuh soket TCP mentah yang tidak
// tersedia di Cloudflare Workers, jadi layanan berbasis HTTP API adalah
// satu-satunya pilihan yang jalan di kedua jalur deploy (Node biasa
// maupun Workers) tanpa kode bercabang.
//
// SENGAJA gagal LUNAK (bukan throw ke pemanggil): mengirim kata sandi
// awal ke email TIDAK BOLEH menggagalkan pembuatan akun itu sendiri —
// akun & kata sandinya sudah sah dibuat di Supabase Auth sebelum fungsi
// ini dipanggil. Kalau pengiriman gagal (kunci API belum diisi, domain
// pengirim belum diverifikasi, dst.), pemanggil (client-users.routes.js)
// tetap mengembalikan kata sandi di respons seperti sebelum fitur ini
// ada — supaya admin masih bisa menyampaikannya manual.

let apiKey = null;
let dariEmail = null;
let portalUrl = null;

/** Dipanggil sekali saat start (server/index.js) atau lazy (server/worker.js). */
function initEmail({ apiKey: k, dariEmail: d, portalUrl: p }) {
  apiKey = k || null;
  dariEmail = d || null;
  portalUrl = p || null;
}

function siapKirim() {
  return !!(apiKey && dariEmail);
}

/**
 * @returns {Promise<{terkirim: boolean, alasan?: string}>} — tidak pernah
 * throw; pemanggil memutuskan sendiri apa yang ditampilkan ke admin.
 */
async function kirimEmail({ ke, subjek, html }) {
  if (!siapKirim()) {
    return { terkirim: false, alasan: 'RESEND_API_KEY/RESEND_FROM_EMAIL belum diatur di server.' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: dariEmail, to: [ke], subject: subjek, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { terkirim: false, alasan: `Resend HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { terkirim: true };
  } catch (err) {
    return { terkirim: false, alasan: err.message };
  }
}

/** Dipakai server/routes/client-users.routes.js saat akun customer baru dibuat. */
async function kirimKredensialCustomer({ ke, nama, email, kataSandiAwal, namaOrg }) {
  const linkPortal = portalUrl || 'https://mikk-portal.sugaras644.workers.dev';
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#1c2733;line-height:1.6">
      <p>Yth. ${esc(nama)},</p>
      <p>Akun Anda pada Portal Klien MIKK Advocates &amp; Counsellors${namaOrg ? ` untuk <b>${esc(namaOrg)}</b>` : ''} sudah dibuat. Berikut kredensial masuk pertama Anda:</p>
      <table style="border-collapse:collapse;margin:14px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Tautan portal</td><td><a href="${linkPortal}">${linkPortal}</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td>${esc(email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Kata sandi awal</td><td><code style="background:#f1f5f9;padding:2px 8px;border-radius:4px">${esc(kataSandiAwal)}</code></td></tr>
      </table>
      <p>Mohon segera masuk dan ganti kata sandi ini. Jangan meneruskan email ini ke pihak lain.</p>
      <p style="color:#98a4b6;font-size:12px;margin-top:24px">Email ini dikirim otomatis oleh sistem — mohon tidak membalas ke alamat ini.</p>
    </div>`;
  return kirimEmail({ ke, subjek: 'Akun Portal Klien MIKK Anda', html });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

module.exports = { initEmail, siapKirim, kirimEmail, kirimKredensialCustomer };
