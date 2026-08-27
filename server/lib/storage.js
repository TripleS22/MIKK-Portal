// server/lib/storage.js
//
// Abstraksi penyimpanan berkas dokumen — disk lokal (Node biasa: dev,
// VPS/Render) ATAU Supabase Storage (Cloudflare Workers — R2 tidak jadi
// dipakai: aktivasinya di dashboard tidak bisa dilakukan, jadi
// penyimpanan dokumen di Workers memakai Supabase Storage lewat REST API,
// bukan binding R2). Sama pola dengan server/lib/db.js (initDb/getPool):
// entrypoint yang sesuai memanggil initDiskStorage() atau
// initSupabaseStorage() SEKALI sebelum route mana pun menyentuh berkas —
// server/routes/documents.routes.js tidak perlu tahu backend mana yang
// sedang dipakai.
//
// Kenapa disk vs cloud WAJIB dipisah (bukan __dirname + fs langsung di
// documents.routes.js seperti sebelumnya): dicoba nyata deploy ke
// Cloudflare Workers, langsung gagal build — __dirname tidak ada di
// modul yang di-bundle sebagai ESM, dan lebih mendasar lagi: Workers
// tidak punya filesystem lokal yang persisten sama sekali (setiap
// permintaan bisa dilayani instance yang berbeda). fs.mkdirSync/
// writeFileSync di sini SEKARANG hanya dieksekusi kalau initDiskStorage()
// benar-benar dipanggil (oleh server/index.js).
//
// Bucket Supabase Storage SENGAJA privat (bukan public:true) — semua
// akses lewat service-role key di server ini saja, sama persis prinsip
// yang sudah dipakai untuk disk lokal (RLS pada baris `documents` yang
// diperiksa DULU, storage yang dibaca/ditulis SETELAHNYA — lihat
// server/routes/documents.routes.js).

let mode = null; // 'disk' | 'supabase'
let diskDir = null;
let sbUrl = null, sbKey = null, sbBucket = null;

function initDiskStorage(uploadDir) {
  const fs = require('fs');
  fs.mkdirSync(uploadDir, { recursive: true });
  mode = 'disk';
  diskDir = uploadDir;
}

/** serviceRoleKey WAJIB service_role (bukan anon) — bucket-nya privat. */
function initSupabaseStorage(supabaseUrl, serviceRoleKey, bucket) {
  mode = 'supabase';
  sbUrl = supabaseUrl;
  sbKey = serviceRoleKey;
  sbBucket = bucket;
}

function pastikanSiap() {
  if (!mode) {
    throw new Error(
      '[storage] Belum diinisialisasi — panggil initDiskStorage() (server/index.js) ' +
      'atau initSupabaseStorage() (server/worker.js) dulu.'
    );
  }
}

/** Simpan berkas. storagePath = path relatif yang sama disimpan di documents.storage_path. */
async function putFile(storagePath, buffer) {
  pastikanSiap();
  if (mode === 'supabase') {
    const res = await fetch(`${sbUrl}/storage/v1/object/${sbBucket}/${storagePath}`, {
      method: 'POST',
      headers: {
        apikey: sbKey, Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`[storage] Gagal mengunggah ke Supabase Storage (HTTP ${res.status}): ${detail}`);
    }
    return;
  }
  const fs = require('fs');
  const path = require('path');
  const full = path.join(diskDir, storagePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
}

/** Ambil isi berkas sebagai Buffer, atau null kalau tidak ada. */
async function getFileBuffer(storagePath) {
  pastikanSiap();
  if (mode === 'supabase') {
    const res = await fetch(`${sbUrl}/storage/v1/object/${sbBucket}/${storagePath}`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`[storage] Gagal mengambil dari Supabase Storage (HTTP ${res.status}): ${detail}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  const fs = require('fs');
  const path = require('path');
  const full = path.join(diskDir, storagePath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
}

module.exports = { initDiskStorage, initSupabaseStorage, putFile, getFileBuffer };
