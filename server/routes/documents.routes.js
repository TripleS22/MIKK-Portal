// server/routes/documents.routes.js
//
// Berkas fisik disimpan di disk lokal (folder `uploads/`), BUKAN di
// direktori yang dilayani express.static — supaya tidak ada jalur akses
// langsung tanpa lewat pengecekan RLS. Setiap unduhan wajib melalui
// GET /api/documents/:id/download, yang lebih dulu menanyakan ke
// Postgres (via queryAsUser, dengan RLS aktif) apakah baris dokumen ini
// boleh dibaca pengguna yang sedang login — baru setelah itu berkasnya
// di-stream. Kalau baris tidak ditemukan (karena RLS memblokir), unduhan
// gagal sebelum satu byte pun terkirim.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { queryAsUser, withUser } = require('../lib/db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — sesuaikan sebelum produksi
});

// GET /api/documents?clientOrgId=&entityType=&entityId=
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId, entityType, entityId } = req.query;
    if (!clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

    const where = ['d.client_org_id = $1'];
    const params = [clientOrgId];
    if (entityType && entityId) {
      where.push(`exists (select 1 from document_links l
                            where l.document_id = d.id and l.entity_type = $2 and l.entity_id = $3)`);
      params.push(entityType, entityId);
    }
    const { rows } = await queryAsUser(
      req.user.id,
      `select d.id, d.nama_file, d.mime_type, d.ukuran_byte, d.kategori_arsip, d.tahun_arsip,
              d.uploaded_at, u.nama as uploaded_by_nama
         from documents d left join users u on u.id = d.uploaded_by
        where ${where.join(' and ')}
        order by d.uploaded_at desc`,
      params
    );
    res.json({ rows });
  } catch (err) { next(err); }
});

// POST /api/documents  (multipart/form-data: file, clientOrgId, kategoriArsip, entityType?, entityId?)
router.post('/', upload.single('file'), async (req, res, next) => {
  const b = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'Berkas wajib diunggah.' });
  if (!b.clientOrgId) return res.status(400).json({ error: 'clientOrgId wajib disertakan.' });

  // WAJIB divalidasi SEBELUM menyentuh filesystem sama sekali — clientOrgId
  // berasal dari input pengguna dan dipakai sebagai nama folder di bawah.
  // Tanpa validasi ini, nilai seperti "../../etc" bisa membuat mkdirSync
  // membuat direktori di luar folder uploads/ sebelum RLS sempat menolak
  // insert-nya di database.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(b.clientOrgId)) {
    return res.status(400).json({ error: 'clientOrgId tidak valid.' });
  }

  try {
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const storedName = `${crypto.randomUUID()}${path.extname(req.file.originalname) || ''}`;
    const storagePath = path.join(b.clientOrgId, storedName); // relatif — disimpan di DB

    const result = await withUser(req.user.id, async (client) => {
      const { rows } = await client.query(
        `insert into documents
           (client_org_id, storage_path, nama_file, mime_type, ukuran_byte, sha256,
            kategori_arsip, tahun_arsip, rahasia, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
         returning id`,
        [b.clientOrgId, storagePath, req.file.originalname, req.file.mimetype, req.file.size,
         sha256, b.kategoriArsip || null, new Date().getFullYear(), req.user.id]
      );
      const doc = rows[0];
      if (b.entityType && b.entityId) {
        await client.query(
          `insert into document_links (document_id, entity_type, entity_id) values ($1,$2,$3)
           on conflict do nothing`,
          [doc.id, b.entityType, b.entityId]
        );
      }
      return doc;
    });

    // Filesystem disentuh HANYA setelah baris database berhasil (RLS lolos).
    // Kalau insert gagal (mis. RLS menolak org yang bukan miliknya), tidak
    // ada folder atau berkas yang sempat dibuat sama sekali.
    const clientDir = path.join(UPLOAD_DIR, b.clientOrgId);
    fs.mkdirSync(clientDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, storedName), req.file.buffer);

    res.status(201).json({ id: result.id });
  } catch (err) { next(err); }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await queryAsUser(
      req.user.id,
      `select storage_path, nama_file, mime_type from documents where id = $1`,
      [req.params.id]
    );
    if (!rows.length) {
      // Sengaja tidak membedakan "tidak ada" dari "tidak boleh diakses" —
      // keduanya menghasilkan pesan yang sama ke pengguna.
      return res.status(404).json({ error: 'Dokumen tidak ditemukan, atau Anda tidak punya akses.' });
    }
    const doc = rows[0];
    const fullPath = path.join(UPLOAD_DIR, doc.storage_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(410).json({ error: 'Berkas tidak ditemukan di penyimpanan server.' });
    }
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nama_file)}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) { next(err); }
});

module.exports = router;
