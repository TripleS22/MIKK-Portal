// server/worker.js — titik masuk Cloudflare Workers.
//
// server/index.js (Node biasa) TETAP ada, dipakai untuk dev lokal —
// Hyperdrive adalah binding khusus Workers, jadi lokal tidak lewat sini
// sama sekali, connect langsung ke Supabase seperti biasa.
//
// httpServerHandler (dari "cloudflare:node") adalah jembatan resmi
// Cloudflare untuk menjalankan server Node.js (Express, dkk) di atas
// Workers lewat compatibility flag nodejs_compat — bukan menulis ulang
// tiap route jadi gaya Workers murni. server/app.js (Express) dipakai
// APA ADANYA, tidak diubah untuk berkas ini.
//
// initDbPerRequest() TIDAK dipanggil di scope modul (top-level) — sudah
// dicoba dan gagal nyata: Workers menolak operasi async di luar sebuah
// handler ("Disallowed operation called within global scope"). Karena
// itu diundur sampai permintaan pertama BENAR-BENAR masuk, di dalam
// fetch() di bawah — env (berisi binding Hyperdrive) juga cuma valid di
// situ, bukan saat modul di-load.
//
// initDbPerRequest() (bukan initDb()) SENGAJA dipakai di sini, bukan
// cuma soal timing — lihat catatan panjang di server/lib/db.js: Pool
// persisten yang dipakai ulang lintas request (initDb(), pola yang
// benar untuk server/index.js) terbukti hang ~20-30% di bawah beban
// paralel nyata kalau dipakai di Workers. initDbPerRequest() membuat
// koneksi baru per request/transaksi (dibuang setelah dipakai) — pola
// yang didokumentasikan resmi oleh Cloudflare untuk Hyperdrive.
import { httpServerHandler } from 'cloudflare:node';

const { initDbPerRequest } = require('./lib/db');
const { initSupabaseStorage } = require('./lib/storage');
const app = require('./app');

const PORT = 3000;
app.listen(PORT);

const nodeHandler = httpServerHandler({ port: PORT });

let ready = false;

export default {
  async fetch(request, env, ctx) {
    // run_worker_first = true (lihat wrangler.toml) berarti SEMUA
    // permintaan masuk sini dulu, termasuk aset statis — yang bukan
    // /api/* diteruskan langsung ke binding Assets (env.ASSETS),
    // supaya tetap disajikan Cloudflare di edge, bukan lewat Express.
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    if (!ready) {
      initDbPerRequest(env.HYPERDRIVE.connectionString);
      // R2 tidak jadi dipakai (aktivasinya di dashboard Cloudflare tidak
      // bisa diselesaikan) — dokumen disimpan di Supabase Storage lewat
      // REST API (bucket privat "mikk-documents", akses cuma pakai
      // service-role key server ini, sama seperti pola akses admin
      // Supabase Auth di server/lib/supabase-auth.js).
      initSupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, 'mikk-documents');
      ready = true;
    }
    return nodeHandler.fetch(request, env, ctx);
  },
};
