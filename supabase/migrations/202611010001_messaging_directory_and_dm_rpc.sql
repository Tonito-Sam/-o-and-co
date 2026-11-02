create or replace function public.get_messaging_directory(_search text default null)
returns table (id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, coalesce(nullif(profile.full_name, ''), 'Workspace member'), profile.avatar_url
  from public.profiles profile
  where auth.uid() is not null
    and profile.id <> auth.uid()
    and (
      exists (
        select 1
        from public.user_roles assigned
        where assigned.user_id = profile.id
          and assigned.role::text <> 'member'
      )
      or exists (
        select 1
        from public.organization_members membership
        where membership.user_id = profile.id
          and membership.status = 'active'
          and membership.role::text = 'admin'
      )
    )
    and (
      nullif(btrim(_search), '') is null
      or profile.full_name ilike '%' || btrim(_search) || '%'
    )
  order by profile.full_name
  limit 100;
$$;

revoke all on function public.get_messaging_directory(text) from public;
grant execute on function public.get_messaging_directory(text) to authenticated;

create or replace function public.create_direct_message(_recipient_id uuid, _body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_thread_id uuid;
  v_body text := btrim(coalesce(_body, ''));
begin
  if v_sender_id is null then
    raise exception 'Sign in to send a direct message.';
  end if;
  if _recipient_id is null or _recipient_id = v_sender_id then
    raise exception 'Choose another workspace member.';
  end if;
  if v_body = '' or length(v_body) > 4000 then
    raise exception 'Messages must contain 1 to 4000 characters.';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = _recipient_id
      and (
        exists (
          select 1
          from public.user_roles assigned
          where assigned.user_id = profile.id
            and assigned.role::text <> 'member'
        )
        or exists (
          select 1
          from public.organization_members membership
          where membership.user_id = profile.id
            and membership.status = 'active'
            and membership.role::text = 'admin'
        )
      )
  ) then
    raise exception 'That member is not available for direct messages.';
  end if;

  insert into public.direct_threads (created_by)
  values (v_sender_id)
  returning id into v_thread_id;

  insert into public.direct_thread_members (thread_id, profile_id)
  values (v_thread_id, v_sender_id), (v_thread_id, _recipient_id);

  insert into public.direct_messages (thread_id, author_id, body)
  values (v_thread_id, v_sender_id, v_body);

  return v_thread_id;
end;
$$;

revoke all on function public.create_direct_message(uuid, text) from public;
grant execute on function public.create_direct_message(uuid, text) to authenticated;