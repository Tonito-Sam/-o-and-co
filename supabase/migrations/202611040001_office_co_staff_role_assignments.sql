create or replace function public.assign_staff_role(
  p_user_id uuid,
  p_role text,
  p_branch_id uuid,
  p_assign boolean default true
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
begin
  if p_role not in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales', 'sales_manager', 'crm_manager', 'finance') then
    raise exception 'This platform role cannot be assigned from this screen.';
  end if;
  if p_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') and p_branch_id is null then
    raise exception 'Choose a branch for this role.';
  end if;
  if p_role in ('sales_manager', 'crm_manager', 'finance') and p_branch_id is not null then
    raise exception 'This role has group-wide scope and cannot be assigned to one branch.';
  end if;
  if p_branch_id is not null and not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Choose a live branch.';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and lower(btrim(split_part(coalesce(email, ''), '@', 2))) = 'officeandco.co.za'
  ) then
    raise exception 'Roles can only be assigned to Office & Co staff accounts.';
  end if;

  if not (public.is_platform_admin(auth.uid()) or public.has_role(auth.uid(), 'group_ceo')) then
    if p_role not in ('cafe_manager', 'community_manager')
      or not public.is_branch_manager(auth.uid(), p_branch_id) then
      raise exception 'You can only assign café or community managers in your own branch.';
    end if;
  end if;

  v_role := p_role::public.app_role;
  if p_assign then
    if not exists (
      select 1 from public.user_roles
      where user_id = p_user_id and role = v_role
        and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      insert into public.user_roles(user_id, role, branch_id) values (p_user_id, v_role, p_branch_id);
    end if;
    if v_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') then
      update public.profiles set work_branch_id = p_branch_id where id = p_user_id;
    end if;
  else
    delete from public.user_roles where user_id = p_user_id and role = v_role
      and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') then
      update public.profiles set work_branch_id = (
        select branch_id from public.user_roles
        where user_id = p_user_id and role::text in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales')
          and branch_id is not null
        order by id
        limit 1
      ) where id = p_user_id;
    end if;
  end if;
end;
$$;

revoke all on function public.assign_staff_role(uuid, text, uuid, boolean) from public;
grant execute on function public.assign_staff_role(uuid, text, uuid, boolean) to authenticated;
