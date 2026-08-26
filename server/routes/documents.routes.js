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
//
// Dokumen bisa melekat ke salah satu dari TIGA jenis pemilik — persis
// satu (lihat constraint documents_satu_pemilik di
// 11_klien_perorangan_kelompok.sql): clientOrgId, individualClientId,
// atau clientGroupId.

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/documents?clientOrgId=&entityType=&entityId=
// atau  ?individualClientId=...   atau  ?clientGroupId=...
router.get('/', async (req, res, next) => {
  try {
    const { clientOrgId, individualClientId, clientGroupId, entityType, entityId } = req.query;
    const terisi = [clientOrgId, individualClientId, clientGroupId].filter(Boolean);
    if (terisi.length !== 1) {
      return res.status(400).json({ error: 'Sertakan persis satu dari clientOrgId, individualClientId, atau clientGroupId.' });
    }

    const where = [
      'd.client_org_id is not distinct from $1',
      'd.individual_client_id is not distinct from $2',
      'd.client_group_id is not distinct from $3',
    ];
    const params = [clientOrgId || null, individualClientId || null, clientGroupId || null];
    if (entityType && entityId) {
      where.push(`exists (select 1 from document_links l
                            where l.document_id = d.id and l.entity_type = $4 and l.entity_id = $5)`);
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

// POST /api/documents  (multipart/form-data: file, clientOrgId|individualClientId|clientGroupId,
//                        kategoriArsip, entityType?, entityId?)
router.post('/', upload.single('file'), async (req, res, next) => {
  const b = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'Berkas wajib diunggah.' });

  const pemilik = { clientOrgId: b.clientOrgId || null, individualClientId: b.individualClientId || null, clientGroupId: b.clientGroupId || null };
  const terisi = Object.values(pemilik).filter(Boolean);
  if (terisi.length !== 1) {
    return res.status(400).json({ error: 'Sertakan persis satu dari clientOrgId, individualClientId, atau clientGroupId.' });
  }
  const pemilikId = terisi[0];

  // WAJIB divalidasi SEBELUM menyentuh filesystem sama sekali — id pemilik
  // berasal dari input pengguna dan dipakai sebagai nama folder di bawah.
  // Tanpa validasi ini, nilai seperti "../../etc" bisa membuat mkdirSync
  // membuat direktori di luar folder uploads/ sebelum RLS sempat menolak
  // insert-nya di database.
  if (!UUID_RE.test(pemilikId)) {
    return res.status(400).json({ error: 'ID pemilik dokumen tidak valid.' });
  }

  try {
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const storedName = `${crypto.randomUUID()}${path.extname(req.file.originalname) || ''}`;
    const storagePath = path.join(pemilikId, storedName); // relatif — disimpan di DB

    const result = await withUser(req.user.id, async (client) => {
      const { rows } = await client.query(
        `insert into documents
           (client_org_id, individual_client_id, client_group_id,
            storage_path, nama_file, mime_type, ukuran_byte, sha256,
            kategori_arsip, tahun_arsip, rahasia, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
         returning id`,
        [pemilik.clientOrgId, pemilik.individualClientId, pemilik.clientGroupId,
         storagePath, req.file.originalname, req.file.mimetype, req.file.size,
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
    const clientDir = path.join(UPLOAD_DIR, pemilikId);
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
