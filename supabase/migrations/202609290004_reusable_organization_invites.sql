alter table public.organization_invite_codes
  add column if not exists code_value text,
  add column if not exists revoked_at timestamptz,
  add column if not exists use_count integer not null default 0,
  add column if not exists last_used_at timestamptz;

create unique index if not exists idx_organization_invites_one_active_code
  on public.organization_invite_codes(organization_id)
  where code_value is not null and revoked_at is null;

create or replace function public.create_organization_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_branch_id uuid;
  v_code text;
begin
  if v_user_id is null then raise exception 'Sign in before creating an invite.'; end if;
  select organization_id, branch_id into v_organization_id, v_branch_id
  from public.organization_members
  where user_id = v_user_id and role = 'admin' and status = 'active';
  if v_organization_id is null then raise exception 'Only an organization admin can create invite codes.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_organization_id::text), 0);
  select code_value into v_code
  from public.organization_invite_codes
  where organization_id = v_organization_id
    and code_value is not null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if v_code is not null then return v_code; end if;

  update public.organization_invite_codes
  set revoked_at = now()
  where organization_id = v_organization_id
    and code_value is not null
    and revoked_at is null;

  v_code := upper(encode(gen_random_bytes(16), 'hex'));
  insert into public.organization_invite_codes (
    organization_id, branch_id, code_hash, code_value, created_by, expires_at
  ) values (
    v_organization_id,
    v_branch_id,
    digest(convert_to(v_code, 'UTF8'), 'sha256'),
    v_code,
    v_user_id,
    now() + interval '1 year'
  );
  return v_code;
end;
$$;

create or replace function public.get_organization_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_code text;
begin
  if v_user_id is null then raise exception 'Sign in to view your organization invite code.'; end if;
  select organization_id into v_organization_id
  from public.organization_members
  where user_id = v_user_id and status = 'active';
  if v_organization_id is null then raise exception 'Your account is not an active member of an organization.'; end if;

  select code_value into v_code
  from public.organization_invite_codes
  where organization_id = v_organization_id
    and code_value is not null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  return v_code;
end;
$$;

create or replace function public.rotate_organization_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before rotating an invite code.'; end if;
  select organization_id into v_organization_id
  from public.organization_members
  where user_id = v_user_id and role = 'admin' and status = 'active';
  if v_organization_id is null then raise exception 'Only an organization admin can rotate invite codes.'; end if;

  update public.organization_invite_codes
  set revoked_at = now()
  where organization_id = v_organization_id
    and code_value is not null
    and revoked_at is null;
  return public.create_organization_invite();
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
    and revoked_at is null
    and expires_at > now()
    and (code_value is not null or consumed_at is null)
  for update;

  if not found then raise exception 'This invite code is invalid, expired, or revoked.'; end if;

  insert into public.organization_members (user_id, organization_id, branch_id, role)
  values (v_user_id, v_invite.organization_id, v_invite.branch_id, 'member');

  if v_invite.code_value is null then
    update public.organization_invite_codes
    set consumed_at = now(), consumed_by = v_user_id
    where id = v_invite.id;
  else
    update public.organization_invite_codes
    set use_count = use_count + 1, last_used_at = now()
    where id = v_invite.id;
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (
    v_user_id,
    'organization',
    v_invite.organization_id,
    'member_joined',
    jsonb_build_object('invite_id', v_invite.id, 'reusable_code', v_invite.code_value is not null)
  );

  return v_invite.organization_id;
end;
$$;

revoke all on function public.create_organization_invite() from public;
revoke all on function public.get_organization_invite_code() from public;
revoke all on function public.rotate_organization_invite_code() from public;
revoke all on function public.accept_organization_invite(text) from public;
grant execute on function public.create_organization_invite() to authenticated;
grant execute on function public.get_organization_invite_code() to authenticated;
grant execute on function public.rotate_organization_invite_code() to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;
