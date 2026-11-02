create or replace function public.create_event_checkin_code(
  p_event_id uuid default null,
  p_booking_id uuid default null,
  p_union_station_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id uuid;
  v_session_id uuid;
  v_code text;
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a check-in code.';
  end if;
  if num_nonnulls(p_event_id, p_booking_id, p_union_station_request_id) <> 1 then
    raise exception 'Choose one event or booking.';
  end if;

  if p_event_id is not null then
    select branch_id into v_branch_id
    from public.events
    where id = p_event_id and status = 'published';
  elsif p_booking_id is not null then
    select branch_id into v_branch_id
    from public.bookings
    where id = p_booking_id
      and status::text = 'confirmed'
      and (request_status is null or request_status = 'confirmed');
  else
    select branch_id into v_branch_id
    from public.union_station_requests
    where id = p_union_station_request_id
      and status::text in ('confirmed', 'invoiced')
      and event_date >= current_date;
  end if;
  if v_branch_id is null then
    raise exception 'The selected event or confirmed booking was not found.';
  end if;

  select exists (
    select 1 from public.user_roles role_assignment
    where role_assignment.user_id = auth.uid()
      and (
        role_assignment.role in ('group_admin', 'group_ceo', 'superadmin')
        or (
          role_assignment.branch_id = v_branch_id
          and role_assignment.role in ('branch_manager', 'community_manager')
        )
      )
  ) into v_allowed;
  if not v_allowed then
    raise exception 'You do not manage this branch.';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.event_checkin_sessions (
    event_id, booking_id, union_station_request_id, branch_id, access_code, created_by
  ) values (
    p_event_id, p_booking_id, p_union_station_request_id, v_branch_id, v_code, auth.uid()
  ) returning id into v_session_id;

  return jsonb_build_object('id', v_session_id, 'access_code', v_code);
end;
$$;

create or replace function public.get_public_event_checkin(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_details jsonb;
begin
  select jsonb_build_object(
    'title', coalesce(
      event.title,
      request.event_type || ' · ' || request.client_company,
      room.name || ' room check-in',
      booking.space_name || ' booking check-in',
      'Meeting space check-in'
    ),
    'client', 'Office & Co · ' || branch.name,
    'starts_at', coalesce(
      event.starts_at,
      (request.event_date + request.starts_time) at time zone 'Africa/Johannesburg',
      booking.starts_at
    ),
    'location', case
      when request.id is not null then 'Union Station · ' || branch.name
      else coalesce(room.name, booking.space_name, 'Meeting space') || ' · ' || branch.name
    end
  ) into v_details
  from public.event_checkin_sessions session
  join public.branches branch on branch.id = session.branch_id
  left join public.events event on event.id = session.event_id
  left join public.bookings booking on booking.id = session.booking_id
  left join public.rooms room on room.id = booking.room_id
  left join public.union_station_requests request on request.id = session.union_station_request_id
  where session.access_code = lower(btrim(p_code))
    and session.active
    and (session.event_id is null or event.status = 'published')
    and (
      session.booking_id is null
      or (
        booking.status::text = 'confirmed'
        and (booking.request_status is null or booking.request_status = 'confirmed')
      )
    )
    and (
      session.union_station_request_id is null
      or (request.status::text in ('confirmed', 'invoiced') and request.event_date >= current_date)
    );
  return v_details;
end;
$$;

revoke all on function public.create_event_checkin_code(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_public_event_checkin(text) from public;
grant execute on function public.create_event_checkin_code(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_public_event_checkin(text) to anon, authenticated;
