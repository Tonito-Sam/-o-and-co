alter type public.app_role add value if not exists 'superadmin';

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    or (_role::text = 'group_ceo' and exists (
      select 1 from public.user_roles where user_id = _user_id and role::text = 'superadmin'
    ));
$$;

insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', email, 'Workspace member')
from auth.users
on conflict (id) do update
set email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website text,
  industry text,
  branch_id uuid not null references public.branches(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  role text not null check (role in ('admin','member')),
  status text not null default 'active' check (status in ('active','suspended')),
  joined_at timestamptz not null default now()
);
create index if not exists idx_organization_members_org on public.organization_members(organization_id, role, status);

create table if not exists public.organization_invite_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  code_hash bytea not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_organization_invites_org on public.organization_invite_codes(organization_id, created_at desc);

create or replace function public.has_organization_role(_user_id uuid, _organization_id uuid, _role text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.user_id = _user_id
      and m.organization_id = _organization_id
      and m.status = 'active'
      and (_role is null or m.role = _role)
  );
$$;

create or replace function public.is_office_co_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = _user_id
      and r.role::text in ('superadmin','group_ceo','sales_manager','rosebank_sales','branch_manager','community_manager','finance')
  );
$$;

create or replace function public.create_organization_for_current_user(
  p_name text,
  p_website text,
  p_industry text,
  p_branch_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then raise exception 'Sign in before creating an organization.'; end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Enter an organization name between 2 and 160 characters.';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'Your account is already associated with an organization.';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Select an active Office & Co branch.';
  end if;

  insert into public.organizations (name, normalized_name, website, industry, branch_id, created_by)
  values (
    v_name,
    lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g')),
    nullif(btrim(p_website), ''),
    nullif(btrim(p_industry), ''),
    p_branch_id,
    v_user_id
  ) returning id into v_organization_id;

  insert into public.organization_members (user_id, organization_id, branch_id, role)
  values (v_user_id, v_organization_id, p_branch_id, 'admin');

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_user_id, 'organization', v_organization_id, 'created', jsonb_build_object('name', v_name, 'branch_id', p_branch_id));

  return v_organization_id;
exception
  when unique_violation then
    raise exception 'An organization with this name is already registered. Join it using an invite code.';
end;
$$;

create or replace function public.create_organization_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_branch_id uuid;
  v_code text := upper(encode(gen_random_bytes(16), 'hex'));
begin
  if v_user_id is null then raise exception 'Sign in before creating an invite.'; end if;
  select organization_id, branch_id into v_organization_id, v_branch_id
  from public.organization_members
  where user_id = v_user_id and role = 'admin' and status = 'active';
  if v_organization_id is null then raise exception 'Only an organization admin can create invite codes.'; end if;

  insert into public.organization_invite_codes (organization_id, branch_id, code_hash, created_by, expires_at)
  values (v_organization_id, v_branch_id, digest(convert_to(v_code, 'UTF8'), 'sha256'), v_user_id, now() + interval '7 days');

  return v_code;
end;
$$;

create or replace function public.accept_organization_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.organization_invite_codes%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in before using an invite code.'; end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'Your account is already associated with an organization.';
  end if;

  select * into v_invite
  from public.organization_invite_codes
  where code_hash = digest(convert_to(upper(btrim(p_code)), 'UTF8'), 'sha256')
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then raise exception 'This invite code is invalid, expired, or already used.'; end if;

  update public.organization_invite_codes
  set consumed_at = now(), consumed_by = v_user_id
  where id = v_invite.id;

  insert into public.organization_members (user_id, organization_id, branch_id, role)
  values (v_user_id, v_invite.organization_id, v_invite.branch_id, 'member');

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_user_id, 'organization', v_invite.organization_id, 'member_joined', jsonb_build_object('invite_id', v_invite.id));

  return v_invite.organization_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invite_codes enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated
  using (public.has_organization_role(auth.uid(), id) or public.is_office_co_staff(auth.uid()));
drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update on public.organizations for update to authenticated
  using (public.has_organization_role(auth.uid(), id, 'admin'))
  with check (public.has_organization_role(auth.uid(), id, 'admin'));

drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.has_organization_role(auth.uid(), organization_id, 'admin') or public.is_office_co_staff(auth.uid()));

grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant all on public.organizations, public.organization_members, public.organization_invite_codes to service_role;
revoke all on table public.organization_invite_codes from anon, authenticated;
revoke all on function public.has_organization_role(uuid, uuid, text) from public;
revoke all on function public.is_office_co_staff(uuid) from public;
revoke all on function public.create_organization_for_current_user(text, text, text, uuid) from public;
revoke all on function public.create_organization_invite() from public;
revoke all on function public.accept_organization_invite(text) from public;
grant execute on function public.create_organization_for_current_user(text, text, text, uuid) to authenticated;
grant execute on function public.create_organization_invite() to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;
grant execute on function public.has_organization_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.is_office_co_staff(uuid) to authenticated, service_role;
