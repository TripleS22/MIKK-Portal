-- =====================================================================
--  MIKK CLIENT PORTAL — DATA AWAL
--  Klien pertama: PT Niaga Handal Cemerlang (NHC)
--  Sumber: CLM_NHC_2026.xlsx — 114 baris, dibersihkan & dinormalisasi
--    * tanggal dari 3 format campuran dikonversi ke tipe date
--    * dokumen non-kontrak dipisah ke legal_correspondence
--    * perpanjangan ditautkan ke induknya
--    * nomor duplikat dikosongkan dan ditandai di catatan_migrasi
--  Jalankan setelah 02_rls_dan_views.sql
-- =====================================================================

set session app.current_user_id = '4967ac24-780b-4bea-a11a-159c6a238560';

-- ---------- pengguna & staf ----------
insert into users (id, email, nama, tipe) values
  ('4967ac24-780b-4bea-a11a-159c6a238560', 'irfan@mikklaws.com', 'Muhamad Irfan Kasuma', 'mikk_staff'),
  ('695999db-ee5c-4161-ac57-7acc8cf8c3f7', 'ageng@mikklaws.com', 'Ageng Galuh B.', 'mikk_staff'),
  ('5c618da2-146b-4d67-8990-48d907ef5fb1', 'putri@mikklaws.com', 'Putri A. D.', 'mikk_staff');

insert into mikk_staff (user_id, jabatan, gelar) values
  ('4967ac24-780b-4bea-a11a-159c6a238560', 'managing_partner', 'S.H., CPLA'),
  ('695999db-ee5c-4161-ac57-7acc8cf8c3f7', 'senior_associate', 'S.H.'),
  ('5c618da2-146b-4d67-8990-48d907ef5fb1', 'associate', 'S.H.');

-- ---------- klien retainer ----------
insert into client_orgs (id, nama_legal, nama_singkat, kbli, sektor_usaha, status_retainer) values
  ('a286e20b-e76d-4aa2-8314-b412a504121f', 'PT Niaga Handal Cemerlang', 'NHC', array['49213','49426','52219'], 'Transportasi darat / shuttle', 'aktif'),
  ('92af541d-3bf3-466a-a74f-204c4f6b6748', 'PT Rasantara Cipta Pangan', 'RCP', array['10710','46319'], 'Industri pangan', 'aktif');
comment on column client_orgs.kbli is 'KBLI di atas adalah DUGAAN dari nama & jenis usaha — wajib dikoreksi tim MIKK dari NIB asli sebelum gap analysis dipercaya.';

insert into client_assignments (client_org_id, user_id, peran) values
  ('a286e20b-e76d-4aa2-8314-b412a504121f', '4967ac24-780b-4bea-a11a-159c6a238560', 'pic_utama'),
  ('a286e20b-e76d-4aa2-8314-b412a504121f', '695999db-ee5c-4161-ac57-7acc8cf8c3f7', 'pendukung'),
  ('92af541d-3bf3-466a-a74f-204c4f6b6748', '5c618da2-146b-4d67-8990-48d907ef5fb1', 'pic_utama');

-- ---------- kategori kontrak (P3: kosakata milik klien) ----------
insert into contract_categories (id, client_org_id, nama, urutan) values
  ('19208019-834c-4f94-81a0-5c7fe37f47da', 'a286e20b-e76d-4aa2-8314-b412a504121f', 'Agen', 0),
  ('8abd0be7-bcf8-4ebb-ae77-1ef0b99a1990', 'a286e20b-e76d-4aa2-8314-b412a504121f', 'MOU', 1),
  ('5d553602-3a42-46e8-96c5-cb5b603f6da8', 'a286e20b-e76d-4aa2-8314-b412a504121f', 'PKS & MOU', 2),
  ('8f9740b7-df48-4fae-85d7-954c3bcd945a', 'a286e20b-e76d-4aa2-8314-b412a504121f', 'Pool', 3);

-- ---------- registri lawan pihak ----------
-- PT Rasantara ditandai is_client: ia lawan pihak NHC SEKALIGUS klien MIKK.
-- Inilah pemicu conflict check pertama di sistem ini.
insert into counterparties (id, nama_legal, nama_alias, jenis, is_client, client_org_id, catatan, created_by) values
  ('0218f8db-928f-4a03-b020-8edfb49c43d2', 'PT Rasantara Cipta Pangan', array['Rasantara','PT Rasantara'], 'pt', true, '92af541d-3bf3-466a-a74f-204c4f6b6748', 'Lawan pihak NHC sekaligus klien retainer MIKK — wajib tinjauan Managing Partner', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7278a950-0610-49ab-aac1-e1662d2701e1', 'PT Tiketux Indonesia', array['Tiketux'], 'pt', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7dab9f7e-5686-4075-a8dc-49e720d48459', 'Fakultas Psikologi Universitas Padjadjaran', array['Psikologi UNPAD'], 'instansi', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('271632a2-86ea-4461-b748-d4e0268300f3', 'PT Bandarudara Internasional Jawa Barat', array['BIJB'], 'pt', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7e5493b9-072c-4a5f-83a8-5bb6c4498d7a', 'PT MBH Property', array['MBHP','MBH Property'], 'pt', false, null, 'Sewa pool Bekasi', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e70b35c1-7a74-4095-bc32-bf1fe5eea669', 'PT CTL', array['CTL'], 'pt', false, null, 'Pihak tersomasi', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('3ab75312-dceb-4f20-a0ea-769024dcfd3b', 'PT VKTR Teknologi Mobilitas', array['VKTR'], 'pt', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5ca83b43-83af-42a8-8b71-7d00edb3e2ad', 'PT Hexa', array['Hexa'], 'pt', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('2c0bf459-bb6a-4307-909d-d811b022d0a2', 'PT Pos Indonesia (Persero)', array['Pos Indonesia'], 'pt', false, null, 'Mitra PKS SADAYA', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('6c11776e-c416-4471-b956-aa2a69e26ec0', 'PT Standard Biosensor Healthcare', array['Standard Biosensor'], 'pt', false, null, 'Mitra PKS SADAYA', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('b71c3983-bb5f-442e-909b-d610c94eb47b', 'SMKN 8 Bandung', array[]::text[], 'instansi', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('fed5c0cf-0aff-4f58-ae2b-b8359acc2baa', 'PT BGI', array['BGI'], 'pt', false, null, 'Jasa keamanan', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('40ada6c1-c4c9-4e86-ad74-e084e6ed1d8e', 'Perusahaan Sejati Group', array['Sejati Group'], 'pt', false, null, null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('9cff87a1-642c-4c21-9884-5a5883e9630d', 'Grafinex', array[]::text[], 'pt', false, null, 'Vendor partisi pool Bekasi', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5f783ad8-ae85-443c-9116-353fb8b0fd04', 'Barokah Spring', array[]::text[], 'pt', false, null, 'Mitra PKS ACCC', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4e2577e4-8fb3-45d5-813d-6f4bece0fd13', 'Robert Litan', array[]::text[], 'perorangan', false, null, 'Pemilik lahan', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('2a479311-83ce-46cf-9f36-1cf2f45689be', 'Faisal Fauzi', array[]::text[], 'perorangan', false, null, 'Pihak NDA', '4967ac24-780b-4bea-a11a-159c6a238560');

-- ---------- kontrak: 104 baris ----------
insert into contracts (id, client_org_id, nomor_dokumen, judul, kategori_id, jenis_dokumen,
                       tanggal_mulai, tanggal_berakhir, status_siklus, pic_legal_id,
                       catatan_migrasi, created_by) values
  ('d4dab7ed-0694-428d-b497-129806aedaba', 'a286e20b-e76d-4aa2-8314-b412a504121f', '005/MKT/SPK/III/2024', 'PICK UP POINT ARNES SHUTTLE SUMEDANG', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-03-21', '2026-08-08', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('eff7badf-776b-4508-bc4d-73583d630a04', 'a286e20b-e76d-4aa2-8314-b412a504121f', '004/MKT/SPK/I/2024', 'POOL ARNES SHUTTLE JATINANGOR', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-01-15', '2025-01-14', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('062983d2-dbc2-4875-a1af-c3c8e05e7b31', 'a286e20b-e76d-4aa2-8314-b412a504121f', '031/SPK/NHC/MO/V/2024', 'POOL ARNES SHUTTLE INDRAMAYU', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-05-31', '2025-05-16', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('a9e86bb1-d0fa-414c-8074-eb0b33f0e69d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '001/DEV/FM/VII/2024', 'POOL ARNES SHUTTLE ITC FATMAWATI', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-07-21', '2025-07-21', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('f4847d97-bf8e-4875-a722-ff458b98b55e', 'a286e20b-e76d-4aa2-8314-b412a504121f', '002/MKT/VI/2024', 'PICK UP POINT ARNES SHUTTLE KUNAFE', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-06-21', '2025-06-20', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('6b76c034-711f-4dd6-bf53-331b83b0b441', 'a286e20b-e76d-4aa2-8314-b412a504121f', '002/SPK/NHC/VIII/2024', 'POOL ARNES SHUTTLE MAJA MAJALENGKA', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-10-02', null, 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', 'tanggal berakhir (2024-09-02) mendahului tanggal mulai (2024-10-02) di data sumber — tanggal berakhir dikosongkan, mohon dikoreksi dari dokumen asli', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('f575e118-f447-4f80-b10e-47dc88079503', 'a286e20b-e76d-4aa2-8314-b412a504121f', '001/SPK-POOL/NHC/IX/2024', 'POOL ARNES SHUTTLE CIANJUR', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-08-17', '2025-08-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('812b5bef-77bb-4ca7-b727-c7cb010fc241', 'a286e20b-e76d-4aa2-8314-b412a504121f', '002/SPK-POOL/NHC/IX/2024', 'POOL ARNES SHUTTLE MAJA MAJALENGKA', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-09-02', '2025-09-02', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5aa3c973-9673-4bd8-9ee0-ebea2b7eb5e5', 'a286e20b-e76d-4aa2-8314-b412a504121f', '003/SPK-POOL/NHC/IX/2024', 'POOL ARNES SHUTTLE PANCORAN', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-09-11', '2025-09-02', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e023d2f4-3f1a-4883-a546-24bc414eb614', 'a286e20b-e76d-4aa2-8314-b412a504121f', '004/SPK-POOL/NHC/X/2024', 'POOL ARNES SHUTTLE TONJONG MAJALENGKA (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-10-14', '2025-10-14', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('fb5f3fc5-f9d1-469a-a64f-bdeca4968ccf', 'a286e20b-e76d-4aa2-8314-b412a504121f', 'MBHP/MKT-LEASE/09/2024/8428', 'POOL ARNES SHUTTLE BEKASI (KONFIRMASI PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-02-01', '2026-01-31', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('c6d78623-b5a3-4284-a708-0a0a969bb3b0', 'a286e20b-e76d-4aa2-8314-b412a504121f', '005/SPK-LAHAN/NHC/X/2024', 'PERJANJIAN SEWA LAHAN PARKIR SUKAMULYA', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-10-04', '2029-10-04', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('859f58fd-05f6-4783-810d-0ab1adff69d0', 'a286e20b-e76d-4aa2-8314-b412a504121f', '021/PM/FM/VII/2024', 'SEWA PARKIR ITC FATMAWATI', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-06-21', '2025-06-20', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('740b9ed5-6ed5-45d7-b466-7ccd1789e79f', 'a286e20b-e76d-4aa2-8314-b412a504121f', '006/SPK-POOL/NHC/X/2024', 'POOL ARNES SHUTTLE PANCORAN (BARU)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4bd2bc45-2ebb-4ff4-aab0-ff6563aaeaee', 'a286e20b-e76d-4aa2-8314-b412a504121f', '007/SPK-POOL/XI/2024', 'POOL ARNES SHUTTLE KADIPATEN MAJALENGKA', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-11-30', '2025-11-30', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5d403b16-b2e5-4a43-9fa4-1131bf14e8c2', 'a286e20b-e76d-4aa2-8314-b412a504121f', '008/SPK-LAHAN/NHC/X/2024', 'SEWA PARKIR PANCORAN (BARU)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('92fccc92-6421-43d7-a146-11d8ef023504', 'a286e20b-e76d-4aa2-8314-b412a504121f', '010/SPK-POOL/NHC/XI/2024', 'POOL ARNES SHUTTLE BEKASI (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-02-01', '2026-01-31', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0cd424ad-7514-4c55-8660-5d9c52abb799', 'a286e20b-e76d-4aa2-8314-b412a504121f', '011/SPK-POOL/NHC/I/2025', 'POOL ARNES SHUTTLE CIPETIR SOREANG', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-12-20', '2025-12-20', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('292f2794-f0a2-42b4-9d27-afbea4558798', 'a286e20b-e76d-4aa2-8314-b412a504121f', '012/SPK-POOL/NHC/XI/2024', 'POOL ARNES SHUTTLE PAMANUKAN SUBANG (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-12-18', '2025-12-18', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('82200d87-96a3-49d7-8c94-a0d89824110e', 'a286e20b-e76d-4aa2-8314-b412a504121f', '013/ADD-POOL/NHC/XI/2024', 'ADDENDUM POOL ARNES SHUTTLE PAMANUKAN SUBANG (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2024-12-18', '2025-12-18', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('867cee8a-199b-49d8-b4a2-d3d6eff4f04d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '014/SPK-POOL/NHC/I/2024', 'POOL ARNES SHUTTLE JATINANGOR (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-01-15', '2026-01-15', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5c79a762-28fc-4dc0-8966-7bdb7f812c97', 'a286e20b-e76d-4aa2-8314-b412a504121f', '015/SPK-POOL/NHC/I/2025', 'POOL ARNES SHUTTLE CIREBON (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-01-31', '2026-01-31', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e785dc45-43cb-4678-80c0-fbcfe6321bdc', 'a286e20b-e76d-4aa2-8314-b412a504121f', '016/SPK/POOL/NHC/I/2025', 'POOL ARNES SHUTTLE SADANG B (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-01-01', '2025-12-31', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('ae428724-e49a-405c-9d2e-aa0911c80345', 'a286e20b-e76d-4aa2-8314-b412a504121f', '017/SPK/POOL/NHC/II/2025', 'PICK UP POINT MADTARI', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('a6d1f522-99e0-44a6-b40e-0b679880d6cb', 'a286e20b-e76d-4aa2-8314-b412a504121f', '018/SPK/POOL/NHC/Ii/2025', 'ADDENDUM POOL ARNES SHUTTLE SADANG B (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('fa4ba6bb-8596-4c52-9f75-249634d62f9a', 'a286e20b-e76d-4aa2-8314-b412a504121f', '019/SPK/POOL/NHC/III/2025', 'POOL ARNES SHUTTLE CIKOPO (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-03-01', '2026-03-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('fe885804-0c9f-4c90-85ff-91e40c9e37cd', 'a286e20b-e76d-4aa2-8314-b412a504121f', '020/SPK/POOL/NHC/III/2025', 'POOL ARNES SHUTTLE PANCORAN (INKOPAU)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-05-01', '2026-05-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d013ccd1-d23c-4a81-8871-079dd1f0b0da', 'a286e20b-e76d-4aa2-8314-b412a504121f', '021/SPK/POOL/NHC/VI/2025', 'POOL ARNES SHUTTLE INDRAMAYU (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-06-17', '2025-12-16', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('1629aa7d-6f25-45d5-9375-86fbc050680a', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'POOL ARNES SHUTTLE KUNAFE (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-06-21', '2025-12-20', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('406141b9-74a4-47f9-9b1c-b5c872afdb46', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'POOL ARNES SHUTTLE KUNAFE (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-12-21', '2026-12-20', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d59fd4ff-c1df-4f0f-bfcc-ff9fcaea676f', 'a286e20b-e76d-4aa2-8314-b412a504121f', '022/AMANDEMEN/NHC/VI/2025', 'AMANDEMEN POOL INDRAMAYU', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-05-17', '2026-05-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e46c8bf7-8a71-4537-bf32-e8b45dc2e1cf', 'a286e20b-e76d-4aa2-8314-b412a504121f', '023/SPK/POOL/NHC/VI/2025', 'POOL PURWAKARTA (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-07-01', '2027-07-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('399ff7a7-a163-4fe7-b27c-3f91403719de', 'a286e20b-e76d-4aa2-8314-b412a504121f', '024/SPK/POOL/NHC/VII/2025', 'POOL ARNES SHUTTLE BUAH BATU (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-07-01', '2026-06-30', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('bf2a0f1f-d925-4aff-a124-b4e0a173c003', 'a286e20b-e76d-4aa2-8314-b412a504121f', '025/SPK/POOL/NHC/VII/2025', 'POOL ARNES SHUTTLE GADING TUTUKA SOREANG', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-07-16', '2026-01-16', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('fadd9ea1-0fbf-4c5b-a143-3a8d7ff1401d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '026/SPK/POOL/NHC/VII/2025', 'PICK UP POINT SUMEDANG (NEW)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-08-12', '2026-08-12', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7d615722-6285-4978-a55f-7dfe30911134', 'a286e20b-e76d-4aa2-8314-b412a504121f', '027/SPK/POOL/NHC/VIII/2025', 'POOL CIANJUR (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-08-18', '2026-08-18', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('9a737347-b142-40b0-afbd-61bbacb195c4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '028/SPK/POOL/NHC/IX/2025', 'POOL SUBANG', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('5990ec7a-1edb-4b34-a4eb-8c2f27a471d8', 'a286e20b-e76d-4aa2-8314-b412a504121f', '029/SPK/POOL/NHC/XI/2025', 'POOL ARNES SHUTTLE KADIPATEN MAJALENGKA (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-12-01', '2026-12-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('ea240269-9102-48bf-875a-bc85fae69408', 'a286e20b-e76d-4aa2-8314-b412a504121f', '030/SPK/POOL/NHC/XI/2025', 'POOL ARNES SHUTTLE SPBU CIBUBUR', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-11-23', '2026-11-23', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0a15b921-63aa-4884-b91f-e68d213ce49d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '031/SPK/POOL/NHC/XII/2025', 'POOL ARNES SHUTTLE 3SECOND DEPOK', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-12-23', '2026-12-23', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('52fd5b66-f3f0-48ee-8682-70f5c5856264', 'a286e20b-e76d-4aa2-8314-b412a504121f', '032/SPK/POOL/NHC/XII/2025', 'POOL ARNES SHUTTLE JATINANGOR (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-01-12', '2027-01-12', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('8bedfd2b-9306-4dd0-b166-e7e3fea0d0f4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '033/SPK/POOL/NHC/XII/2025', 'POOL ARNES SHUTTLE PAMANUKAN SUBANG (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2025-12-19', '2026-12-19', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('bfacf3f8-d7f9-4267-93c9-21b5fad9e305', 'a286e20b-e76d-4aa2-8314-b412a504121f', '034/SPK/POOL/NHC/I/2026', 'POOL ARNES SHUTTLE CIPETIR SOREANG (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('33adc187-1771-4b46-a2d6-42140cf78db6', 'a286e20b-e76d-4aa2-8314-b412a504121f', '035/SPK/POOL/NHC/I/2026', 'POOL ARNES SHUTTLE SADANG B (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('6ff17972-55d7-43a4-8949-d2bbdfeb2a5f', 'a286e20b-e76d-4aa2-8314-b412a504121f', '036/SPK/POOL/NHC/I/2026', 'POOL ARNES SHUTTLE CIREBON (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-01-31', '2027-01-31', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('61a7f8bd-dd24-461b-a00f-3d4a03271979', 'a286e20b-e76d-4aa2-8314-b412a504121f', '037/SPK/POOL/NHC/II/2026', 'PICK UP POINT MADTARI (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-05-01', '2027-05-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('de3dcff5-4638-44c6-aa85-8d3b321705d7', 'a286e20b-e76d-4aa2-8314-b412a504121f', '038/ADD-POOL/NHC/II/2026', 'ADDENDUM POOL SHUTTLE CIPETIR SOREANG (PERPANJANG)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('2f644317-fc94-4b9b-aaba-f16e8e6720a1', 'a286e20b-e76d-4aa2-8314-b412a504121f', '039/SPK/POOL/NHC/II/2026', 'POOL ARNES SHUTTLE CIKOPO (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-03-01', '2027-03-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('92a04110-bb28-49fb-beab-2c8d6bda63fb', 'a286e20b-e76d-4aa2-8314-b412a504121f', '040/SPK/POOL/NHC/III/2026', 'POOL ARNES SHUTTLE PANCORAN (INKOPAU) (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-05-01', '2027-05-01', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('46ede850-18fd-4df2-824d-0b9052a7c005', 'a286e20b-e76d-4aa2-8314-b412a504121f', '041/SPK/POOL/NHC/IV/2026', 'POOL ARNES SHUTTLE GROGOL (NEW)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-04-13', '2028-04-13', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d5adf070-bdf2-4ce6-b6ab-12ffeaae6e27', 'a286e20b-e76d-4aa2-8314-b412a504121f', '042/SPK/POOL/NHC/V/2026', 'POOL ARNES SHUTTLE INDRAMAYU (PERPANJANG 2)', '8f9740b7-df48-4fae-85d7-954c3bcd945a', 'PKS', '2026-05-17', '2028-05-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d5bacf74-5ef1-4686-a035-a5c85250dac6', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES SHUTTLE LOSARANG', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('3be37d7e-81f4-4295-b8b4-d15847a7155d', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES SHUTTLE LOHBENER', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('77c463cc-87da-4931-bf12-ced254e94ab1', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES SHUTTLE KARANGSINOM', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('290b5608-cfee-4b34-bb13-b17a3d735a98', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES SHUTTLE SUKAMANDI', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0358174a-67dc-4c62-af5d-b07b8aa59452', 'a286e20b-e76d-4aa2-8314-b412a504121f', '004/MKT/SPK/III/2024', 'AGEN ARNES SHUTTLE PATROL INDRAMAYU', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2024-03-01', '2029-02-28', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0c0ae97b-14a9-4625-9dde-ca5b2bb1364c', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES SHUTTLE SUKALARANG SUKABUMI', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2024-05-21', '2029-05-21', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', 'nomor dokumen duplikat dengan "PICK UP POINT ARNES SHUTTLE SUMEDANG" — dikosongkan saat migrasi, mohon dikoreksi', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('a169f5d3-f814-4aa2-9fa6-6e0386421878', 'a286e20b-e76d-4aa2-8314-b412a504121f', '007/SPK-AGEN/NHC/VIII/2024', 'AGEN ARNES SHUTTLE PALIMANAN CIREBON', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2024-08-22', '2025-08-22', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('91c1bc17-8284-4564-9bd9-59899c7f5ad4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '009/SPK-AGEN/NHC/X/2024', 'AGEN ARNES SHUTTLE PAREAN GIRANG INDRAMAYU', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2024-10-12', '2025-10-12', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('cb9dd660-7036-4bcf-bc7b-aece6370e844', 'a286e20b-e76d-4aa2-8314-b412a504121f', '010/SPK-AGEN/NHC/I/2025', 'AGEN ARNES SHUTTLE CIASEM SUBANG', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-01-25', '2026-01-25', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e1c4b1ce-8a60-4ddc-a736-ff28469a7a8d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '011/SPK-AGEN/NHC/II/2025', 'AGEN ARNES SHUTTLE LOSARANG INDRAMAYU', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('b845ca50-f137-49c7-9f58-f3a630cf41c3', 'a286e20b-e76d-4aa2-8314-b412a504121f', '012/SPK-AGEN/NHC/VI/2025', 'AGEN ARNES SHUTTLE PARUNG KUDA', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-06-03', '2025-09-03', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('8f6a0c2c-5396-4640-b053-82880ecec489', 'a286e20b-e76d-4aa2-8314-b412a504121f', '013/SPK-AGEN/NHC/VI/2025', 'AGEN ARNES SHUTTLE PLERED CIREBON', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('c7262d5c-7651-4b61-a9a3-14673feb76e3', 'a286e20b-e76d-4aa2-8314-b412a504121f', '014/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE SUKAMANDI', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-17', '2025-10-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('8d5bb476-4b4a-4d7e-b695-193bcb3167ed', 'a286e20b-e76d-4aa2-8314-b412a504121f', '015/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE LOHBENER (2)', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-17', '2025-10-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('ffcce823-0a8d-46c4-8221-2d76feb61d4c', 'a286e20b-e76d-4aa2-8314-b412a504121f', '016/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE LOSARANG (2)', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-17', '2025-10-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4fe4386c-e3e9-456c-bb1d-f530a445878f', 'a286e20b-e76d-4aa2-8314-b412a504121f', '017/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE TUGU MANGGA', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-17', '2025-10-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('47b7903c-9f1a-41e6-bf00-6a0ba15b6a77', 'a286e20b-e76d-4aa2-8314-b412a504121f', '020/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE MAJALENGKA', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-22', '2025-10-22', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('1d1340b4-e070-4563-bdf5-814ddb0c7cfc', 'a286e20b-e76d-4aa2-8314-b412a504121f', '021/SPK-AGEN/NHC/VII/2025', 'AGEN ARNES SHUTTLE CISAAT', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2015-08-19', '2025-11-19', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('b5334df4-60c6-4f35-9639-294b42c67391', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'AGEN ARNES PUSAKANAGARA SUBANG', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-07-17', '2025-10-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', 'nomor dokumen duplikat dengan "AGEN ARNES SHUTTLE TUGU MANGGA" — dikosongkan saat migrasi, mohon dikoreksi', '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('37b49ac2-0b67-41e7-8525-f28a6b1161b7', 'a286e20b-e76d-4aa2-8314-b412a504121f', '018/SPK-AGEN/NHC/IX/2025', 'AGEN KALIJATI SUBANG', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-09-22', '2025-12-22', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e60906af-11e5-46b0-aafa-030523e1c5aa', 'a286e20b-e76d-4aa2-8314-b412a504121f', '019/SPK-AGEN/NHC/IX/2025', 'AGEN CILAMERI SUBANG KOTA', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2025-09-22', '2025-12-22', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('cf17da64-fee5-410a-960e-0714a5517b6b', 'a286e20b-e76d-4aa2-8314-b412a504121f', '020/SPK-AGEN/NHC/II/2026', 'AGEN ARNES SHUTTLE PALIMANAN CIREBON (PERPANJANG)', '19208019-834c-4f94-81a0-5c7fe37f47da', 'PKS', '2026-02-23', '2031-02-23', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('3d8d56ef-88ae-4585-abb3-20a466b6fb2a', 'a286e20b-e76d-4aa2-8314-b412a504121f', '001/PKS/NHC/X/2024', 'PKS NHC dengan Tiketux', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7a57402e-d2a7-45b5-a320-1feb1e2581c4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '002/PKS/NHC/IX/2024', 'PKS NHC dengan PT Rasantara', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0a848d60-bbd3-4d25-b2f8-8dc8346e4ff6', 'a286e20b-e76d-4aa2-8314-b412a504121f', '003/PKS-NDA/NHC/X/2024', 'PKS NHC dengan Psikologi UNPAD', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('f6c81571-afc1-4730-bf6c-59482f9a5e42', 'a286e20b-e76d-4aa2-8314-b412a504121f', '004/PKS/NHC/X/2024', 'PKS NHC dengan BIJB', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('35aaf512-58b2-48db-9979-8db1bf8baadd', 'a286e20b-e76d-4aa2-8314-b412a504121f', '005/PKS/NHC/X/2024', 'PKS NHC dengan Bambang', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d134f0b0-66db-4e07-95a6-c1e68047b4c7', 'a286e20b-e76d-4aa2-8314-b412a504121f', '006/PKS/NHC/X/2024', 'Trial Agreement NHC dengan VKTR', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('e3f6a531-99b3-4cd8-a242-05074ee79be4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '009/SPK-Reklame/NHC/XII/2024', 'PKS Sewa Menyewa Papan Reklame', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('bf176e6d-29d9-4c20-9828-9882ba2e5220', 'a286e20b-e76d-4aa2-8314-b412a504121f', '010/SPK-Reklame/NHC/XII/2024', 'PKS Pembayaran Pajak Papan Reklame', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('d93e2784-5ae7-484b-9d3e-fbce7cbf7a75', 'a286e20b-e76d-4aa2-8314-b412a504121f', '011/PKS-NDA/NHC/XII/2024', 'NDA FAISAL FAUZI', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('b82cfdf4-1ecf-4b72-9202-331b93f59c14', 'a286e20b-e76d-4aa2-8314-b412a504121f', '012/PKS-KP/NHC/I/2025', 'Surat Kesepakatan Perdamaian', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('040bfa65-6ca6-470b-93a7-88f97d52b7fc', 'a286e20b-e76d-4aa2-8314-b412a504121f', '013/PKS/NHC/VI/2025', 'SURAT pERJANJIAN KANTOR BARU', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2025-06-02', '2026-06-02', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('416c045f-9e58-4fa5-ab93-eb09d03d4d4c', 'a286e20b-e76d-4aa2-8314-b412a504121f', '014/PKS/NHC/VI/2025', 'Vendor carport pancoran', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2025-06-03', '2025-06-10', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7bec2ac6-8ea4-4bff-9298-ba987927151a', 'a286e20b-e76d-4aa2-8314-b412a504121f', '015/PKS/NHC/VI/2025', 'PKS Vendor 3S', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('24c8ee00-267a-45fb-8d19-2652c31c6a6c', 'a286e20b-e76d-4aa2-8314-b412a504121f', '016/PKS/NHC/VI/2025', 'PKS Vendor RMP', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('7d696aae-a250-4478-83ca-8e8754c957be', 'a286e20b-e76d-4aa2-8314-b412a504121f', '017/PKS/NHC/VI/2025', 'PKS PT Hexa', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2025-06-11', '2026-06-11', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('614e1890-4cb1-46b2-95fd-2bfbf423bce0', 'a286e20b-e76d-4aa2-8314-b412a504121f', '019/P-Perdamaian/NHC/VII/2025', 'Perjanjian Perdamaian Laka Fortuner', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('bcb6ef0a-036e-4243-a122-dce95d20d863', 'a286e20b-e76d-4aa2-8314-b412a504121f', '020/PKS/NHC/VIII/2025', 'VENDOR KANOPI PANCORAN', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('2fa4a138-1a5a-48d9-940a-fbdd788ad4c0', 'a286e20b-e76d-4aa2-8314-b412a504121f', '021/PKS/NHC/IX/2025', 'PKS MESS DAN PARKIRAN POOL MAJALENGKA', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4563041d-597a-4007-92ee-3a1fa78d1acc', 'a286e20b-e76d-4aa2-8314-b412a504121f', '022/PKS/SDY/XII/2025', 'PKS SADAYA dengan PT Pos Indonesia', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4ca3072c-eb3b-4668-b714-01b932bf3637', 'a286e20b-e76d-4aa2-8314-b412a504121f', '023/SPK-Reklame/NHC/XII/2025', 'PKS Sewa Menyewa Papan Reklame (Perpanjangan)', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('ed4b2c9f-75c6-4ce2-9262-4bd756ec75e5', 'a286e20b-e76d-4aa2-8314-b412a504121f', '024/SPK-Reklame/NHC/XII/2025', 'PKS Pembayaran Pajak Papan Reklame (Perpanjangan)', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('4f078ae1-a393-4dee-bad7-817ca791e071', 'a286e20b-e76d-4aa2-8314-b412a504121f', '025/PKS/NHC/XII/2025', 'PKS Vendor Partisi Pool Bekasi Grafinex', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('90d635fd-cb0e-45a9-80cd-4e11d076caf4', 'a286e20b-e76d-4aa2-8314-b412a504121f', '026/PKS/NHC/I/2026', 'PKS Sewa Menyewa Bangunan Jatinangor (Rasantara)', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2026-01-17', '2027-01-17', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('c317ea41-ff4c-492a-bdd7-8ba999e1b41d', 'a286e20b-e76d-4aa2-8314-b412a504121f', '027/PKS/SDY/II/2026', 'PKS SADAYA dengan PT Standard Biosensor Healthcare', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2026-02-02', '2026-07-30', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('c97273d7-ad59-44f9-b8e0-8997162b72cf', 'a286e20b-e76d-4aa2-8314-b412a504121f', '028/PKS/ACCC/II/2026', 'PKS ACCC dengan Barokah Spring', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('0208294c-9063-41bd-987d-fab63d4fa95c', 'a286e20b-e76d-4aa2-8314-b412a504121f', '029/PKS/NHC/IV/2026', 'PKS NHC dengan SMKN 8 Bandung', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, '2026-04-01', '2026-06-30', 'aktif', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('aa330f04-191e-48c8-b0aa-629eb894dbe3', 'a286e20b-e76d-4aa2-8314-b412a504121f', '030/PKS/NHC/IV/2026', 'PKS Sewa menyewa sebidang tanah PT NHC dengan Robert Litan', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('77f806fb-17cd-43f4-96e4-9bfb59cc6fdc', 'a286e20b-e76d-4aa2-8314-b412a504121f', '031/PKS/NHC/IV/2026', 'PKS Vendor Neon Box Grogol', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('a472f42a-5687-45ce-95db-a5cd72c67943', 'a286e20b-e76d-4aa2-8314-b412a504121f', '032/PKS/NHC/V/2026', 'PKS Vendor Sipil Bangunan', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('ecd08265-e7a1-4eb8-8c06-e661d16576ce', 'a286e20b-e76d-4aa2-8314-b412a504121f', '033/PKS/NHC/V/2026', 'PKS Sewa Bangunan Head office PT NHC', '5d553602-3a42-46e8-96c5-cb5b603f6da8', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', null, '4967ac24-780b-4bea-a11a-159c6a238560'),
  ('a0193af8-2ee1-40ee-864f-987374b98b1c', 'a286e20b-e76d-4aa2-8314-b412a504121f', null, 'Surat Konfirmasi Perpanjangan Sewa Tempat Pool Bekasi', '8abd0be7-bcf8-4ebb-ae77-1ef0b99a1990', null, null, null, 'draf', '4967ac24-780b-4bea-a11a-159c6a238560', 'nomor dokumen duplikat dengan "POOL ARNES SHUTTLE BEKASI (KONFIRMASI PERPANJANG)" — dikosongkan saat migrasi, mohon dikoreksi', '4967ac24-780b-4bea-a11a-159c6a238560');

-- ---------- tautan induk untuk perpanjangan / addendum / amandemen ----------
-- Sel yang tertaut di bawah adalah USULAN hasil pencocokan nama lokasi.
-- WAJIB diverifikasi ke dokumen asli sebelum dianggap benar.
update contracts set parent_contract_id='fb5f3fc5-f9d1-469a-a64f-bdeca4968ccf', relasi_ke_induk='perpanjangan' where id='92fccc92-6421-43d7-a146-11d8ef023504';
update contracts set parent_contract_id='292f2794-f0a2-42b4-9d27-afbea4558798', relasi_ke_induk='addendum' where id='82200d87-96a3-49d7-8c94-a0d89824110e';
update contracts set parent_contract_id='eff7badf-776b-4508-bc4d-73583d630a04', relasi_ke_induk='perpanjangan' where id='867cee8a-199b-49d8-b4a2-d3d6eff4f04d';
update contracts set parent_contract_id='e785dc45-43cb-4678-80c0-fbcfe6321bdc', relasi_ke_induk='addendum' where id='a6d1f522-99e0-44a6-b40e-0b679880d6cb';
update contracts set parent_contract_id='062983d2-dbc2-4875-a1af-c3c8e05e7b31', relasi_ke_induk='perpanjangan' where id='d013ccd1-d23c-4a81-8871-079dd1f0b0da';
update contracts set parent_contract_id='4bd2bc45-2ebb-4ff4-aab0-ff6563aaeaee', relasi_ke_induk='perpanjangan' where id='5990ec7a-1edb-4b34-a4eb-8c2f27a471d8';
update contracts set parent_contract_id='867cee8a-199b-49d8-b4a2-d3d6eff4f04d', relasi_ke_induk='perpanjangan' where id='52fd5b66-f3f0-48ee-8682-70f5c5856264';
update contracts set parent_contract_id='82200d87-96a3-49d7-8c94-a0d89824110e', relasi_ke_induk='perpanjangan' where id='8bedfd2b-9306-4dd0-b166-e7e3fea0d0f4';
update contracts set parent_contract_id='0cd424ad-7514-4c55-8660-5d9c52abb799', relasi_ke_induk='perpanjangan' where id='bfacf3f8-d7f9-4267-93c9-21b5fad9e305';
update contracts set parent_contract_id='a6d1f522-99e0-44a6-b40e-0b679880d6cb', relasi_ke_induk='perpanjangan' where id='33adc187-1771-4b46-a2d6-42140cf78db6';
update contracts set parent_contract_id='5c79a762-28fc-4dc0-8966-7bdb7f812c97', relasi_ke_induk='perpanjangan' where id='6ff17972-55d7-43a4-8949-d2bbdfeb2a5f';
update contracts set parent_contract_id='ae428724-e49a-405c-9d2e-aa0911c80345', relasi_ke_induk='perpanjangan' where id='61a7f8bd-dd24-461b-a00f-3d4a03271979';
update contracts set parent_contract_id='fa4ba6bb-8596-4c52-9f75-249634d62f9a', relasi_ke_induk='perpanjangan' where id='2f644317-fc94-4b9b-aaba-f16e8e6720a1';
update contracts set parent_contract_id='fe885804-0c9f-4c90-85ff-91e40c9e37cd', relasi_ke_induk='perpanjangan' where id='92a04110-bb28-49fb-beab-2c8d6bda63fb';
update contracts set parent_contract_id='d013ccd1-d23c-4a81-8871-079dd1f0b0da', relasi_ke_induk='perpanjangan' where id='d5adf070-bdf2-4ce6-b6ab-12ffeaae6e27';
update contracts set parent_contract_id='a169f5d3-f814-4aa2-9fa6-6e0386421878', relasi_ke_induk='perpanjangan' where id='cf17da64-fee5-410a-960e-0714a5517b6b';
update contracts set parent_contract_id='e3f6a531-99b3-4cd8-a242-05074ee79be4', relasi_ke_induk='perpanjangan' where id='4ca3072c-eb3b-4668-b714-01b932bf3637';
update contracts set parent_contract_id='bf176e6d-29d9-4c20-9828-9882ba2e5220', relasi_ke_induk='perpanjangan' where id='ed4b2c9f-75c6-4ce2-9262-4bd756ec75e5';

-- Perpanjangan yang induknya TIDAK ditemukan — ditandai untuk penelusuran manual.
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='e023d2f4-3f1a-4883-a546-24bc414eb614';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='fb5f3fc5-f9d1-469a-a64f-bdeca4968ccf';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='292f2794-f0a2-42b4-9d27-afbea4558798';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='5c79a762-28fc-4dc0-8966-7bdb7f812c97';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='e785dc45-43cb-4678-80c0-fbcfe6321bdc';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='fa4ba6bb-8596-4c52-9f75-249634d62f9a';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='1629aa7d-6f25-45d5-9375-86fbc050680a';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='406141b9-74a4-47f9-9b1c-b5c872afdb46';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai amandemen tetapi kontrak induk tidak ditemukan di data sumber') where id='d59fd4ff-c1df-4f0f-bfcc-ff9fcaea676f';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='e46c8bf7-8a71-4537-bf32-e8b45dc2e1cf';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='399ff7a7-a163-4fe7-b27c-3f91403719de';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='7d615722-6285-4978-a55f-7dfe30911134';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai addendum tetapi kontrak induk tidak ditemukan di data sumber') where id='de3dcff5-4638-44c6-aa85-8d3b321705d7';
update contracts set catatan_migrasi = concat_ws('; ', catatan_migrasi, 'ditandai sebagai perpanjangan tetapi kontrak induk tidak ditemukan di data sumber') where id='a0193af8-2ee1-40ee-864f-987374b98b1c';

-- ---------- dokumen non-kontrak: 10 baris ----------
insert into legal_correspondence (id, client_org_id, nomor_dokumen, judul, jenis, tanggal, pic_legal_id, keterangan) values
  ('c7d63414-37c9-487c-a30b-ea996f236244', 'a286e20b-e76d-4aa2-8314-b412a504121f', '009/SP-POOL/NHC/X/2024', 'SURAT PEMBERITAHUAN PEMUTUSAN KONTRAK SEWA ARNES SHUTTLE
(PASAR BARU)', 'pemutusan', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('8968fbc8-c8d5-486d-b2e3-ca9566471932', 'a286e20b-e76d-4aa2-8314-b412a504121f', '008/SPK-AGEN/NHC/IX/2024', 'PEMBERHENTIAN AGEN KARANGSINOM', 'pemutusan', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('1c9e01a5-d2af-48e0-976d-e73898520d03', 'a286e20b-e76d-4aa2-8314-b412a504121f', '018/SP-AGEN/NHC/VII/2025', 'PEMBERHENTIAN AGEN LOSARANG', 'pemutusan', '2025-07-21', '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('4b2e4710-b343-455c-9b88-c2524daf6904', 'a286e20b-e76d-4aa2-8314-b412a504121f', '019/SP-AGEN/NHC/VII/2025', 'PEMBERHENTIAN AGEN LOHBENER', 'pemutusan', '2025-07-21', '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('2fd60ee9-7b58-4bef-9fb6-ec5a8d86cebe', 'a286e20b-e76d-4aa2-8314-b412a504121f', '17/NHC/DIR/X/2024', 'Permohonan Buku Blokir Sistem dan Adm. Badan
Hukum', 'permohonan', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('4a10900f-b079-4134-8e23-c055e19e3f95', 'a286e20b-e76d-4aa2-8314-b412a504121f', '007/Pengaduan/NHC/X/2024', 'Surat Pengaduan Keluhan ke PT MBH Property', 'pengaduan', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('7cb23087-1156-41be-87bb-a949f3bade67', 'a286e20b-e76d-4aa2-8314-b412a504121f', '008/SOMASI/NHC/XI/2024', 'Surat Somasi Kepada PT CTL', 'somasi', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('fd997ea6-afb3-4449-a7da-b22f6a45021c', 'a286e20b-e76d-4aa2-8314-b412a504121f', '018/BAST/NHC/VI/2025', 'BAST VENDOR JAKARTA', 'bast', null, '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('c3bdcb8f-ce5f-4673-8613-d5b4e915efe6', 'a286e20b-e76d-4aa2-8314-b412a504121f', '10/NHC/DIR/X/2024', 'Surat Permohonan Kerja Sama Sewa Tempat', 'permohonan', '2024-10-10', '4967ac24-780b-4bea-a11a-159c6a238560', null),
  ('787501c7-453f-47cb-b7dc-78e0e05fe4c1', 'a286e20b-e76d-4aa2-8314-b412a504121f', '001/PROTAP/NHC/II/2025', 'Prosedur Tetap (PROTAP) Pengelolaan Jasa Keamanan', 'protap', '2025-01-24', '4967ac24-780b-4bea-a11a-159c6a238560', null);

-- ---------- master referensi perizinan ----------
-- CATATAN PENTING: ini kerangka awal, BUKAN daftar lengkap.
-- Tim MIKK wajib melengkapi & memverifikasi sebelum gap analysis dipakai.
insert into permit_types (kode, nama, instansi, masa_berlaku_bulan, kbli_terkait, wajib, masih_berlaku, catatan) values
  ('NIB', 'Nomor Induk Berusaha', 'OSS - BKPM', null, array[]::text[], true, true, 'Berlaku selama usaha beroperasi'),
  ('NPWP', 'NPWP Badan', 'Direktorat Jenderal Pajak', null, array[]::text[], true, true, null),
  ('PKP', 'Pengukuhan Pengusaha Kena Pajak', 'Direktorat Jenderal Pajak', null, array[]::text[], false, true, null),
  ('TDP', 'Tanda Daftar Perusahaan', '-', null, array[]::text[], false, false, 'SUDAH DIHAPUS — dilebur ke NIB melalui OSS. Disimpan hanya untuk riwayat; jangan dihitung sebagai izin berlaku.'),
  ('SIUP', 'Surat Izin Usaha Perdagangan', 'DPMPTSP', 60, array['46319','47'], false, true, 'Sebagian besar tergantikan NIB'),
  ('IZIN_LOKASI', 'Izin Lokasi', 'DPMPTSP', 60, array[]::text[], false, true, null),
  ('UKL_UPL', 'Izin Lingkungan (UKL-UPL)', 'Dinas Lingkungan Hidup', 60, array[]::text[], false, true, null),
  ('SSM', 'Sertifikat Standar', 'BSN / OSS', 36, array[]::text[], false, true, null),
  ('IZIN_GUDANG', 'Izin Operasional Gudang', 'DPMPTSP', 24, array['52101'], false, true, null),
  ('IZIN_ANGKUTAN', 'Izin Penyelenggaraan Angkutan Orang', 'Kemenhub / Dishub', 60, array['49213','49426'], true, true, 'Wajib untuk operator shuttle / angkutan penumpang'),
  ('KARTU_PENGAWASAN', 'Kartu Pengawasan Kendaraan', 'Dishub', 12, array['49213','49426'], true, true, 'Per kendaraan, masa berlaku pendek — kandidat pengingat rutin'),
  ('UJI_BERKALA', 'Uji Berkala Kendaraan (KIR)', 'Dishub', 6, array['49213','49426'], true, true, 'Per kendaraan'),
  ('SERT_HALAL', 'Sertifikat Halal', 'BPJPH', 48, array['10710','56'], false, true, 'Hanya untuk produk pangan'),
  ('IZIN_EDAR_BPOM', 'Izin Edar BPOM', 'BPOM', 60, array['10710'], false, true, 'Hanya untuk produk yang diedarkan'),
  ('ISO9001', 'ISO 9001:2015', 'Lembaga sertifikasi', 36, array[]::text[], false, true, 'Sukarela');

-- ---------- aturan pengingat bawaan ----------
insert into reminder_rules (client_org_id, entity_type, offset_hari, kanal) values
  (null, 'contract', array[180,90,60,30,14,7,1], array['email','in_app']),
  (null, 'permit',   array[180,90,60,30,14,7,1], array['email','in_app']);

-- ---------- tarif konsultasi (dari brief) ----------
-- Angka ini DATA AWAL, bukan tetap. Managing Partner dapat mengubahnya
-- lewat panel admin; versi lama otomatis ditutup, riwayat transaksi tidak berubah.
insert into service_rates (kode, nama, jenis_layanan, tier, satuan, durasi_menit, harga,
                           harga_termasuk_ppn, butuh_penawaran, berlaku_sejak, ditetapkan_oleh, urutan) values
  ('KONSUL_ONLINE', 'Konsultasi Online (Zoom / Google Meet)', 'konsultasi_online', 'umum',
   'per_jam', 60, 500000, false, false, current_date, '4967ac24-780b-4bea-a11a-159c6a238560', 1),
  ('KONSUL_OFFLINE_BDG', 'Konsultasi Tatap Muka - Kantor MIKK Bandung', 'konsultasi_offline', 'umum',
   'per_sesi', 60, 1000000, false, false, current_date, '4967ac24-780b-4bea-a11a-159c6a238560', 2),
  ('KONSUL_LUAR_KOTA', 'Konsultasi Tatap Muka - Luar Kota', 'konsultasi_luar_kota', 'umum',
   'per_hari', null, null, false, true, current_date, '4967ac24-780b-4bea-a11a-159c6a238560', 3);

-- CATATAN: satuan KONSUL_OFFLINE_BDG disetel 'per_sesi' mengikuti brief
-- (brief menyebut Rp 1.000.000 tanpa satuan waktu; mockup menulis '/1 Jam').
-- Mohon dikonfirmasi Pak Irfan sebelum rilis.

reset app.current_user_id;
