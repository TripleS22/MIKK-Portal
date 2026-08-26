// server/lib/my-cases-query.js
//
// Satu fragment SQL dipakai bersama oleh /api/my/cases (dashboard pribadi,
// my.routes.js) dan /api/profile/me/projects (profile.routes.js) —
// "perkara yang ditugaskan ke SAYA", lintas jenis klien (retainer/
// perorangan/kelompok). Sengaja BUKAN "semua perkara yang boleh saya lihat
// lewat RLS": Managing Partner boleh (lewat is_mikk_admin()) melihat semua
// baris, tapi "Perkara Saya" harus tetap berarti perkara yang memang
// ditugaskan padanya (pic_legal_id, atau lewat client_assignments) — bukan
// seluruh perkara firma.

const CASES_MILIK_SAYA_SQL = `
  select v.*,
         case when v.client_org_id is not null then 'retainer'
              when v.individual_client_id is not null then 'perorangan'
              else 'kelompok' end as jenis_klien,
         coalesce(o.nama_singkat, ic.nama, g.nama_kelompok) as klien_nama
    from v_cases_display v
    left join client_orgs o        on o.id  = v.client_org_id
    left join individual_clients ic on ic.id = v.individual_client_id
    left join client_groups g       on g.id  = v.client_group_id
   where v.pic_legal_id = app.current_user_id()
      or exists (
           select 1 from client_assignments ca
            where ca.user_id = app.current_user_id()
              and (ca.selesai is null or ca.selesai >= current_date)
              and (
                (v.client_org_id is not null and ca.client_org_id = v.client_org_id)
                or (v.individual_client_id is not null and ca.individual_client_id = v.individual_client_id)
                or (v.client_group_id is not null and ca.client_group_id = v.client_group_id)
              ))`;

module.exports = { CASES_MILIK_SAYA_SQL };
