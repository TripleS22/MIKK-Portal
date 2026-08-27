-- =====================================================================
--  PROFIL PERUSAHAAN — admin_klien BOLEH EDIT ORGANISASINYA SENDIRI
--  Jalankan setelah 17_master_data_opsi.sql
--
--  Sebelumnya (02_rls_dan_views.sql): client_orgs_tulis hanya
--  app.is_mikk_admin() — klien sama sekali tidak bisa mengubah profil
--  organisasinya sendiri. Keputusan disengaja sekarang: admin_klien
--  (peran tertinggi sisi klien) boleh edit profil org-NYA SENDIRI saja
--  (bukan org klien lain). Peran sisi klien lainnya (legal_manager,
--  viewer) dan staf MIKK biasa (bukan managing_partner/admin_staf)
--  tetap hanya boleh lihat.
-- =====================================================================

create or replace function app.boleh_edit_klien(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select
    app.is_mikk_admin()
    or exists (
      select 1 from client_memberships cm
       where cm.client_org_id = p_org
         and cm.user_id = app.current_user_id()
         and cm.peran = 'admin_klien'
         and cm.aktif
    );
$$;
revoke all on function app.boleh_edit_klien(uuid) from public;
grant execute on function app.boleh_edit_klien(uuid) to mikk_app;

-- client_orgs_tulis (is_mikk_admin() saja) TETAP seperti semula, TIDAK
-- diganti — itu yang menjaga insert/delete organisasi baru tetap
-- hanya wewenang staf MIKK. Ditambah SATU policy baru khusus UPDATE
-- supaya admin_klien bisa mengubah profil org-nya sendiri TANPA ikut
-- mendapat hak insert/delete (RLS meng-OR-kan policy permisif untuk
-- perintah yang sama, jadi ini murni menambah, bukan mengganti).
create policy client_orgs_update_admin_klien on client_orgs for update
  using (app.boleh_edit_klien(id)) with check (app.boleh_edit_klien(id));
