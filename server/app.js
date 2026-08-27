// server/app.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const contractsRoutes = require('./routes/contracts.routes');
const counterpartiesRoutes = require('./routes/counterparties.routes');
const permitsRoutes = require('./routes/permits.routes');
const permitTypesRoutes = require('./routes/permit-types.routes');
const clientOrgsRoutes = require('./routes/client-orgs.routes');
const casesRoutes = require('./routes/cases.routes');
const legalProjectsRoutes = require('./routes/legal-projects.routes');
const pendampinganRoutes = require('./routes/pendampingan.routes');
const documentsRoutes = require('./routes/documents.routes');
const prospectsRoutes = require('./routes/prospects.routes');
const serviceRatesRoutes = require('./routes/service-rates.routes');
const clientUsersRoutes = require('./routes/client-users.routes');
const staffUsersRoutes = require('./routes/staff-users.routes');
const individualClientsRoutes = require('./routes/individual-clients.routes');
const clientGroupsRoutes = require('./routes/client-groups.routes');
const myRoutes = require('./routes/my.routes');
const profileRoutes = require('./routes/profile.routes');
const masterDataRoutes = require('./routes/master-data.routes');

const app = express();

app.use(cors());
// BUKAN express.json() bawaan: rantai dependensinya (body-parser ->
// raw-body -> iconv-lite) gagal di-bundle Cloudflare Workers ("require_streams
// is not a function" — bug nyata di iconv-lite di bawah nodejs_compat,
// sudah dicoba langsung, bukan tebakan). API ini cuma perlu JSON UTF-8
// biasa (tidak ada kebutuhan deteksi charset lain), jadi middleware kecil
// ini cukup dan tidak menyentuh iconv-lite sama sekali.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return next();
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    if (!raw) { req.body = {}; return next(); }
    try { req.body = JSON.parse(raw); next(); }
    catch (e) { res.status(400).json({ error: 'JSON body tidak valid.' }); }
  });
  req.on('error', next);
});
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/counterparties', counterpartiesRoutes);
app.use('/api/permits', permitsRoutes);
app.use('/api/permit-types', permitTypesRoutes);
app.use('/api/client-orgs', clientOrgsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/legal-projects', legalProjectsRoutes);
app.use('/api/pendampingan', pendampinganRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/prospects', prospectsRoutes);
app.use('/api/service-rates', serviceRatesRoutes);
app.use('/api/client-users', clientUsersRoutes);
app.use('/api/staff-users', staffUsersRoutes);
app.use('/api/individual-clients', individualClientsRoutes);
app.use('/api/client-groups', clientGroupsRoutes);
app.use('/api/my', myRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/master-data', masterDataRoutes);

// Di Cloudflare Workers, frontend statis (public/) disajikan langsung
// oleh Cloudflare lewat binding Assets (lihat wrangler.toml: [assets] +
// run_worker_first hanya untuk /api/*) — bukan lewat Express, dan
// __dirname pun tidak ada di modul yang di-bundle Workers. Blok ini
// SENGAJA dilewati di situ; untuk Node biasa (dev lokal, VPS/Render)
// perilakunya tidak berubah sama sekali.
if (typeof __dirname !== 'undefined') {
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// Penanganan galat terpusat. Kesalahan yang berasal dari constraint
// database (lihat mapPgError di contracts.routes.js) sudah punya pesan
// berbahasa Indonesia yang siap ditampilkan; sisanya dicatat ke log
// server tapi TIDAK ditampilkan mentah-mentah ke pengguna.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: status < 500 ? err.message : 'Terjadi kesalahan pada server. Silakan coba lagi.',
  });
});

module.exports = app;
