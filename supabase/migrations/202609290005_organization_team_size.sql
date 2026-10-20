alter table public.organizations
  add column if not exists team_size integer check (team_size is null or team_size between 1 and 100000);

create or replace function public.update_organization_team_size(p_team_size integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_team_size integer;
begin
  if v_user_id is null then raise exception 'Sign in before updating organization details.'; end if;
  if p_team_size is null or p_team_size < 1 or p_team_size > 100000 then
    raise exception 'Team size must be between 1 and 100000.';
  end if;

  select organization_id into v_organization_id
  from public.organization_members
  where user_id = v_user_id and role = 'admin' and status = 'active';
  if v_organization_id is null then
    raise exception 'Only an organization admin can update team size.';
  end if;

  update public.organizations
  set team_size = p_team_size, updated_at = now()
  where id = v_organization_id
  returning team_size into v_team_size;

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_user_id, 'organization', v_organization_id, 'team_size_updated', jsonb_build_object('team_size', v_team_size));

  return v_team_size;
end;
$$;

revoke all on function public.update_organization_team_size(integer) from public;
grant execute on function public.update_organization_team_size(integer) to authenticated;
