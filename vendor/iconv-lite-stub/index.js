// vendor/iconv-lite-stub/index.js
//
// Pengganti paket "iconv-lite" asli (lihat "overrides" di package.json
// root) — HANYA supaya proses bundling Cloudflare Workers tidak crash.
//
// Latar belakang: iconv-lite asli gagal di-bundle Wrangler dengan
// "Uncaught TypeError: require_streams(...) is not a function" — bug
// nyata & masih terbuka di workers-sdk (issue #6648, #9309, #10022),
// dipicu oleh kode top-level iconv-lite sendiri (require("./streams"))
// yang jalan begitu paket ini di-require, BUKAN oleh kode aplikasi ini.
//
// Ini aman diganti stub karena iconv-lite di proyek ini HANYA masuk lewat
// body-parser/raw-body (dependensi Express — Express men-require
// bodyParser.json di express.js secara tanpa syarat, walau aplikasi ini
// TIDAK PERNAH memanggil express.json()/urlencoded()/dst — lihat
// server/app.js, yang menulis parser JSON sendiri persis supaya rantai
// ini tidak perlu dipakai sungguhan). Kalau ternyata ada kode yang
// benar-benar memanggil salah satu fungsi di bawah, itu tanda rantai
// body-parser/raw-body sungguhan sedang dipakai — lempar error yang
// jelas, jangan diam-diam salah decode.
function belumSeharusnyaTerpanggil(nama) {
  return function () {
    throw new Error(
      `[iconv-lite-stub] ${nama}() dipanggil sungguhan. Stub ini sengaja tidak ` +
      'mengimplementasikan fungsi asli — kalau kode ini benar-benar tereksekusi, ' +
      'berarti ada jalur yang memakai body-parser/raw-body sungguhan, dan ' +
      'perlu ditinjau ulang (lihat vendor/iconv-lite-stub/index.js).'
    );
  };
}

module.exports = {
  encode: belumSeharusnyaTerpanggil('encode'),
  decode: belumSeharusnyaTerpanggil('decode'),
  encodingExists: () => false,
  getDecoder: belumSeharusnyaTerpanggil('getDecoder'),
  getEncoder: belumSeharusnyaTerpanggil('getEncoder'),
};
