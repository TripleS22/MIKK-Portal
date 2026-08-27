-- =====================================================================
--  BACA DOKUMEN LEWAT LINK PRATINJAU BERTOKEN (TANPA SESI)
--  Jalankan setelah 18_client_orgs_edit_klien.sql
--
--  GET /api/documents/:id/public (server/routes/documents.routes.js)
--  sengaja TIDAK lewat authenticate — dipakai Google Docs Viewer/MS
--  Office Online yang mengambil berkas sendiri lewat URL, tidak bisa
--  mengirim header sesi. Karena tidak ada app.current_user_id() untuk
--  dicocokkan, RLS biasa (documents_akses) akan MENOLAK semua baris di
--  situasi ini — bukan sesuatu yang perlu "dilonggarkan" di RLS,
--  melainkan memang butuh jalur baca terpisah yang sudah dipercaya lebih
--  dulu oleh kode aplikasi (token HMAC diverifikasi SEBELUM fungsi ini
--  dipanggil sama sekali — lihat verifikasiTokenPreview()).
--
--  Pola SECURITY DEFINER yang sama seperti app.resolusi_lawan_pihak()
--  dan app.cek_benturan() di 02_rls_dan_views.sql — melewati RLS dengan
--  sengaja, dipercayakan ke kode yang memanggilnya, bukan ke sembarang
--  pengguna.
-- =====================================================================

create or replace function app.dokumen_publik(p_id uuid)
returns table (storage_path text, nama_file text, mime_type text)
language sql stable security definer set search_path = public, app as $$
  select storage_path, nama_file, mime_type from documents where id = p_id;
$$;
revoke all on function app.dokumen_publik(uuid) from public;
grant execute on function app.dokumen_publik(uuid) to mikk_app;
