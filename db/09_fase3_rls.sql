-- =====================================================================
--  FASE 3 — RLS & VIEW
--  Jalankan setelah 08_fase3_schema.sql
--
--  Prinsipnya sama seperti Fase 1 & 2: isolasi ditegakkan Postgres, bukan
--  kode aplikasi. Bedanya, pemiliknya bukan client_org melainkan calon
--  klien itu sendiri — jadi pembandingnya app.current_user_id(), bukan
--  app.boleh_akses_klien().
-- =====================================================================

-- Calon klien yang sedang login (null bila yang login bukan calon klien).
create or replace function app.my_prospect_id() returns uuid
language sql stable security definer set search_path = public, app as $$
  select p.id from prospects p where p.user_id = app.current_user_id();
$$;

-- Staf yang boleh menangani corong calon klien. Sengaja lebih luas dari
-- is_mikk_admin(): associate pun perlu melihat permintaan masuk untuk
-- ditinjau, tapi hanya Managing Partner yang boleh memutus benturan
-- kepentingan (ditegakkan di lapisan route, lihat prospects.routes.js).
create or replace function app.is_mikk_staff() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from mikk_staff s where s.user_id = app.current_user_id() and s.aktif
  );
$$;

-- Catatan: service_rates SUDAH punya RLS sejak 02_rls_dan_views.sql
-- (rates_baca untuk semua, rates_tulis hanya Managing Partner). Tidak
-- diulang di sini supaya tidak ada dua definisi untuk tabel yang sama.
alter table prospects             enable row level security;
alter table consultations         enable row level security;
alter table consultation_bookings enable row level security;
alter table prospect_documents    enable row level security;
alter table coupons               enable row level security;

-- Calon klien melihat barisnya sendiri; staf MIKK melihat semuanya.
create policy prospects_akses on prospects for all
  using (user_id = app.current_user_id() or app.is_mikk_staff())
  with check (user_id = app.current_user_id() or app.is_mikk_staff());

create policy consultations_akses on consultations for all
  using (prospect_id = app.my_prospect_id() or app.is_mikk_staff())
  with check (prospect_id = app.my_prospect_id() or app.is_mikk_staff());

-- Booking & dokumen tidak punya pemilik sendiri — ikut konsultasi/calon
-- induknya, supaya tidak ada dua sumber kebenaran untuk "siapa boleh lihat".
create policy bookings_akses on consultation_bookings for all
  using (exists (select 1 from consultations c where c.id = consultation_id
                   and (c.prospect_id = app.my_prospect_id() or app.is_mikk_staff())))
  with check (exists (select 1 from consultations c where c.id = consultation_id
                        and (c.prospect_id = app.my_prospect_id() or app.is_mikk_staff())));

create policy prospect_docs_akses on prospect_documents for all
  using (prospect_id = app.my_prospect_id() or app.is_mikk_staff())
  with check (prospect_id = app.my_prospect_id() or app.is_mikk_staff());

-- Kupon: calon klien TIDAK boleh membaca daftar kupon (kalau bisa, mereka
-- tinggal mencoba semuanya). Penukaran kode dilakukan lewat fungsi
-- security definer di bawah, yang hanya mengembalikan hasil untuk satu
-- kode yang memang diketik pengguna.
create policy coupons_kelola on coupons for all
  using (app.is_mikk_staff())
  with check (app.is_managing_partner());

-- ---------------------------------------------------------------------
-- Penukaran kupon.
-- security definer: memeriksa ke seluruh tabel kupon, tapi hanya
-- mengembalikan putusan untuk SATU kode yang diketik — bukan daftar.
-- Pola yang sama dipakai app.cek_benturan() di 02_rls_dan_views.sql.
-- ---------------------------------------------------------------------
create or replace function app.tukar_kupon(p_kode text, p_jenis text, p_subtotal numeric)
returns table (valid boolean, alasan text, kupon_id uuid, diskon numeric)
language plpgsql stable security definer set search_path = public, app as $$
declare
  k record;
  v_diskon numeric := 0;
begin
  select * into k from coupons
   where upper(kode) = upper(trim(p_kode)) and aktif;

  if not found then
    return query select false, 'Kode kupon tidak dikenali.'::text, null::uuid, 0::numeric; return;
  end if;
  if k.berlaku_sejak > current_date then
    return query select false, 'Kupon belum berlaku.'::text, null::uuid, 0::numeric; return;
  end if;
  if k.berlaku_sampai is not null and k.berlaku_sampai < current_date then
    return query select false, 'Kupon sudah kedaluwarsa.'::text, null::uuid, 0::numeric; return;
  end if;
  if k.kuota is not null and k.terpakai >= k.kuota then
    return query select false, 'Kuota kupon sudah habis.'::text, null::uuid, 0::numeric; return;
  end if;
  if array_length(k.jenis_layanan, 1) is not null
     and not (p_jenis = any (k.jenis_layanan)) then
    return query select false, 'Kupon tidak berlaku untuk jenis konsultasi ini.'::text,
                        null::uuid, 0::numeric; return;
  end if;

  v_diskon := case k.tipe
    when 'gratis'  then p_subtotal
    when 'persen'  then round(p_subtotal * k.nilai / 100, 2)
    when 'nominal' then least(k.nilai, p_subtotal)   -- diskon tidak melebihi tagihan
  end;

  return query select true, k.deskripsi, k.id, v_diskon;
end $$;

-- ---------------------------------------------------------------------
-- View status konsultasi — dihitung, tidak disimpan (PRD Bagian 7.1).
-- ---------------------------------------------------------------------
create or replace view v_consultations_display as
select
  c.id, c.prospect_id, c.nomor, c.kategori_layanan, c.kronologi, c.target_hukum,
  c.lawan_pihak_nama, c.putusan_benturan, c.alasan_benturan, c.status,
  c.catatan_firma, c.created_at,
  p.nama          as prospect_nama,
  p.tipe          as prospect_tipe,
  p.email         as prospect_email,
  b.id            as booking_id,
  b.jenis_meeting, b.tanggal, b.jam_mulai, b.durasi_menit,
  b.harga_satuan, b.diskon, b.total, b.butuh_penawaran, b.status_bayar,
  -- Boleh lanjut membayar HANYA bila benturan sudah dinyatakan aman.
  (c.putusan_benturan = 'aman') as boleh_dibayar,
  case
    when b.tanggal is null then null
    else (b.tanggal - current_date)
  end as hari_ke_jadwal
from consultations c
join prospects p on p.id = c.prospect_id
left join consultation_bookings b
       on b.consultation_id = c.id
      and b.status_bayar not in ('dibatalkan','kedaluwarsa');

grant select, insert, update, delete on prospects, consultations,
  consultation_bookings, prospect_documents, coupons to mikk_app;
grant select on service_rates, v_consultations_display to mikk_app;
grant execute on function app.tukar_kupon(text, text, numeric) to mikk_app;
grant execute on function app.my_prospect_id() to mikk_app;
grant execute on function app.is_mikk_staff() to mikk_app;
grant execute on function app.nomor_konsultasi_berikutnya() to mikk_app;
