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

insert into public.organizations (name, normalized_name, branch_id, created_by)
select 'Office & Co', 'office & co',
       coalesce(p.work_branch_id, b.id), p.id
from public.profiles p
left join public.branches b on b.slug = 'bryanston'
where lower(p.email) = 'vashnitech@yahoo.com'
  and coalesce(p.work_branch_id, b.id) is not null
on conflict (normalized_name) do nothing;

insert into public.organization_members (user_id, organization_id, branch_id, role, status)
select p.id, o.id, coalesce(p.work_branch_id, o.branch_id), 'member', 'active'
from public.profiles p
join public.organizations o on o.normalized_name = 'office & co'
where lower(p.email) = 'vashnitech@yahoo.com'
on conflict (user_id) do nothing;

create or replace function public.set_staff_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization public.organizations%rowtype;
  v_branch_id uuid;
  v_membership_role text;
begin
  if v_user_id is null or not public.is_office_co_staff(v_user_id) then
    raise exception 'Only Office & Co staff can update this organization assignment.';
  end if;

  select * into v_organization
  from public.organizations
  where id = p_organization_id;
  if not found then raise exception 'Organization not found.'; end if;

  if not public.has_role(v_user_id, 'group_ceo')
     and not public.has_role(v_user_id, 'superadmin')
     and v_organization.normalized_name <> 'office & co' then
    raise exception 'Staff can only select the Office & Co organization.';
  end if;

  select work_branch_id into v_branch_id
  from public.profiles
  where id = v_user_id;
  v_branch_id := coalesce(v_branch_id, v_organization.branch_id);
  v_membership_role := case
    when public.has_role(v_user_id, 'group_ceo') or public.has_role(v_user_id, 'superadmin') then 'admin'
    else 'member'
  end;

  insert into public.organization_members (user_id, organization_id, branch_id, role, status)
  values (v_user_id, v_organization.id, v_branch_id, v_membership_role, 'active')
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        branch_id = excluded.branch_id,
        role = excluded.role,
        status = 'active';
end;
$$;

revoke all on function public.set_staff_organization(uuid) from public;
grant execute on function public.set_staff_organization(uuid) to authenticated;
