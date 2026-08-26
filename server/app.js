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
const clientOrgsRoutes = require('./routes/client-orgs.routes');
const casesRoutes = require('./routes/cases.routes');
const legalProjectsRoutes = require('./routes/legal-projects.routes');
const pendampinganRoutes = require('./routes/pendampingan.routes');
const documentsRoutes = require('./routes/documents.routes');
const prospectsRoutes = require('./routes/prospects.routes');
const serviceRatesRoutes = require('./routes/service-rates.routes');
const clientUsersRoutes = require('./routes/client-users.routes');
const individualClientsRoutes = require('./routes/individual-clients.routes');
const clientGroupsRoutes = require('./routes/client-groups.routes');
const myRoutes = require('./routes/my.routes');
const profileRoutes = require('./routes/profile.routes');

const app = express();

app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/counterparties', counterpartiesRoutes);
app.use('/api/permits', permitsRoutes);
app.use('/api/client-orgs', clientOrgsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/legal-projects', legalProjectsRoutes);
app.use('/api/pendampingan', pendampinganRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/prospects', prospectsRoutes);
app.use('/api/service-rates', serviceRatesRoutes);
app.use('/api/client-users', clientUsersRoutes);
app.use('/api/individual-clients', individualClientsRoutes);
app.use('/api/client-groups', clientGroupsRoutes);
app.use('/api/my', myRoutes);
app.use('/api/profile', profileRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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
