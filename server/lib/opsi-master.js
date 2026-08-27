// server/lib/opsi-master.js
//
// Dipakai bersama oleh semua endpoint /reference (cases, contracts,
// permits, legal-projects, pendampingan) untuk membaca opsi dropdown
// dari opsi_master (lihat db/17_master_data_opsi.sql) alih-alih array
// hardcode di kode. Bentuk baris yang dikembalikan ({v, l}) cocok
// langsung dengan opsi()/nameProxy di frontend.

async function opsiKategori(queryAsUser, userId, kategori) {
  const { rows } = await queryAsUser(
    userId,
    `select kode, label_id from opsi_master where kategori = $1 and aktif order by urutan, label_id`,
    [kategori]
  );
  // Dikembalikan sebagai array kode saja (bukan {v,l}) supaya kompatibel
  // dengan bentuk lama (frontend memetakan lewat nameProxy sendiri, mis.
  // TAHAP_NAMA[v]) — nilai i18n tetap dari public/js/i18n.js, opsi_master
  // hanya menentukan KODE mana yang sedang aktif ditawarkan.
  return rows.map((r) => r.kode);
}

module.exports = { opsiKategori };
