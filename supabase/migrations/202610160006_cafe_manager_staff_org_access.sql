create or replace function public.is_office_co_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = _user_id
      and r.role::text in (
        'superadmin', 'group_ceo', 'sales_manager', 'rosebank_sales',
        'branch_manager', 'cafe_manager', 'community_manager', 'finance'
      )
  );
$$;
