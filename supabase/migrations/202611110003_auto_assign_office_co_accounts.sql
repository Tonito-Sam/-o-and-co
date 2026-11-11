do $$
begin
  if not exists (
    select 1 from public.organizations where normalized_name = 'office & co'
  ) then
    raise exception 'Create the Office & Co organization before applying this migration.';
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
  v_organization_branch_id uuid;
  v_membership_branch_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'member')
  on conflict do nothing;

  if lower(btrim(split_part(coalesce(new.email, ''), '@', 2))) = 'officeandco.co.za' then
    select id, branch_id
    into v_organization_id, v_organization_branch_id
    from public.organizations
    where normalized_name = 'office & co';

    if v_organization_id is null then
      raise exception 'The Office & Co organization is not configured.';
    end if;

    select branch_id
    into v_membership_branch_id
    from public.user_roles
    where user_id = new.id and branch_id is not null
    order by branch_id
    limit 1;

    insert into public.organization_members (user_id, organization_id, branch_id, role, status)
    values (
      new.id,
      v_organization_id,
      coalesce(v_membership_branch_id, v_organization_branch_id),
      'member',
      'active'
    )
    on conflict (user_id) do update
      set organization_id = excluded.organization_id,
          branch_id = excluded.branch_id,
          role = case
            when public.organization_members.organization_id = excluded.organization_id
              and public.organization_members.role = 'admin' then 'admin'
            else 'member'
          end,
          status = 'active';
  end if;

  return new;
end;
$$;

insert into public.organization_members (user_id, organization_id, branch_id, role, status)
select
  p.id,
  o.id,
  coalesce(role_branch.branch_id, o.branch_id),
  'member',
  'active'
from public.profiles p
join public.organizations o on o.normalized_name = 'office & co'
left join lateral (
  select ur.branch_id
  from public.user_roles ur
  where ur.user_id = p.id and ur.branch_id is not null
  order by ur.branch_id
  limit 1
) role_branch on true
where lower(btrim(split_part(coalesce(p.email, ''), '@', 2))) = 'officeandco.co.za'
on conflict (user_id) do update
  set organization_id = excluded.organization_id,
      branch_id = excluded.branch_id,
      role = case
        when public.organization_members.organization_id = excluded.organization_id
          and public.organization_members.role = 'admin' then 'admin'
        else 'member'
      end,
      status = 'active';