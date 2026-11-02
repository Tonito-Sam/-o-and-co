create or replace function public.is_global_crm_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('superadmin', 'group_admin', 'group_ceo', 'crm_manager', 'sales_manager', 'finance')
  );
$$;

revoke all on function public.is_global_crm_staff(uuid) from public;
grant execute on function public.is_global_crm_staff(uuid) to authenticated, service_role;