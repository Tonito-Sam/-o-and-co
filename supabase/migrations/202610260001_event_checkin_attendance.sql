create table if not exists public.event_checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  union_station_request_id uuid references public.union_station_requests(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  access_code text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(event_id, booking_id, union_station_request_id) = 1)
);

create table if not exists public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_checkin_sessions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  company text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, email),
  check (email = lower(email))
);

create index if not exists idx_event_checkin_sessions_branch_active
  on public.event_checkin_sessions(branch_id, active, created_at desc);
create index if not exists idx_event_attendees_lead
  on public.event_attendees(lead_id);
create index if not exists idx_event_attendees_email
  on public.event_attendees(email, checked_in_at desc);

alter table public.event_checkin_sessions enable row level security;
alter table public.event_attendees enable row level security;

create policy event_checkin_sessions_manager_read
  on public.event_checkin_sessions for select to authenticated
  using (
    exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.role in ('group_admin', 'group_ceo', 'superadmin')
    )
    or exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.branch_id = event_checkin_sessions.branch_id
        and role_assignment.role in ('branch_manager', 'community_manager')
    )
  );

create policy event_attendees_manager_read
  on public.event_attendees for select to authenticated
  using (
    exists (
      select 1
      from public.event_checkin_sessions session
      join public.user_roles role_assignment on role_assignment.user_id = auth.uid()
      where session.id = event_attendees.session_id
        and (
          role_assignment.role in ('group_admin', 'group_ceo', 'superadmin')
          or (
            role_assignment.branch_id = session.branch_id
            and role_assignment.role in ('branch_manager', 'community_manager')
          )
        )
    )
  );

drop policy if exists union_station_requests_checkin_manager_read on public.union_station_requests;
create policy union_station_requests_checkin_manager_read
  on public.union_station_requests for select to authenticated
  using (
    exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.role in ('group_admin', 'group_ceo', 'superadmin')
    )
    or exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.branch_id = union_station_requests.branch_id
        and role_assignment.role = 'branch_manager'
    )
  );

grant select on public.event_checkin_sessions, public.event_attendees to authenticated;
grant all on public.event_checkin_sessions, public.event_attendees to service_role;
revoke all on public.event_checkin_sessions, public.event_attendees from anon;

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
    select room.branch_id into v_branch_id
    from public.bookings booking
    join public.rooms room on room.id = booking.room_id
    where booking.id = p_booking_id and booking.status::text = 'confirmed';
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

create or replace function public.set_event_checkin_active(
  p_session_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id uuid;
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage check-in codes.';
  end if;
  select branch_id into v_branch_id
  from public.event_checkin_sessions
  where id = p_session_id;
  if v_branch_id is null then
    raise exception 'Check-in code not found.';
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

  update public.event_checkin_sessions
  set active = p_active
  where id = p_session_id;
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
    'title', coalesce(event.title, request.event_type || ' · ' || request.client_company, room.name || ' room check-in'),
    'client', 'Office & Co · ' || branch.name,
    'starts_at', coalesce(event.starts_at, (request.event_date + request.starts_time) at time zone 'Africa/Johannesburg', booking.starts_at),
    'location', case when request.id is not null then 'Union Station · ' || branch.name else coalesce(room.name || ' · ', '') || branch.name end
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
    and (session.booking_id is null or booking.status::text = 'confirmed')
    and (session.union_station_request_id is null or (request.status::text in ('confirmed', 'invoiced') and request.event_date >= current_date));
  return v_details;
end;
$$;

create or replace function public.submit_public_event_checkin(
  p_code text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_company text default null,
  p_marketing_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.event_checkin_sessions%rowtype;
  v_details jsonb;
  v_lead_id uuid;
  v_attendee_id uuid;
  v_email text;
  v_name text;
  v_company text;
begin
  v_name := btrim(coalesce(p_full_name, ''));
  v_email := lower(btrim(coalesce(p_email, '')));
  v_company := nullif(btrim(coalesce(p_company, '')), '');
  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Enter your full name.';
  end if;
  if length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if length(coalesce(p_phone, '')) > 50 or length(coalesce(v_company, '')) > 160 then
    raise exception 'Contact details are longer than allowed.';
  end if;

  select * into v_session
  from public.event_checkin_sessions
  where access_code = lower(btrim(coalesce(p_code, '')))
    and active;
  if not found then
    raise exception 'This check-in code is not active.';
  end if;
  v_details := public.get_public_event_checkin(p_code);
  if v_details is null then
    raise exception 'This event or room booking is no longer available for check-in.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_session.branch_id::text, 0));
  select id into v_lead_id
  from public.leads
  where branch_id = v_session.branch_id
    and lower(contact_email) = v_email
  order by created_at desc
  limit 1
  for update;

  if v_lead_id is null then
    insert into public.leads (
      company_name, contact_name, contact_email, contact_phone, source, stage, sales_stage, branch_id
    ) values (
      coalesce(v_company, 'Event attendee'), v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''),
      'Event check-in: ' || (v_details->>'title'), 'new_lead', 'New Lead', v_session.branch_id
    ) returning id into v_lead_id;
  end if;

  insert into public.event_attendees as existing_attendee (
    session_id, lead_id, full_name, email, phone, company, marketing_consent, marketing_consent_at
  ) values (
    v_session.id, v_lead_id, v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''), v_company,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end
  )
  on conflict (session_id, email) do update set
    lead_id = excluded.lead_id,
    marketing_consent = existing_attendee.marketing_consent or excluded.marketing_consent,
    marketing_consent_at = case
      when excluded.marketing_consent then coalesce(existing_attendee.marketing_consent_at, excluded.marketing_consent_at)
      else existing_attendee.marketing_consent_at
    end
  returning id into v_attendee_id;

  return jsonb_build_object(
    'attendee_id', v_attendee_id,
    'lead_id', v_lead_id,
    'event_title', v_details->>'title'
  );
end;
$$;

revoke all on function public.create_event_checkin_code(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_event_checkin_active(uuid, boolean) from public, anon;
revoke all on function public.get_public_event_checkin(text) from public;
revoke all on function public.submit_public_event_checkin(text, text, text, text, text, boolean) from public;
grant execute on function public.create_event_checkin_code(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_event_checkin_active(uuid, boolean) to authenticated;
grant execute on function public.get_public_event_checkin(text) to anon, authenticated;
grant execute on function public.submit_public_event_checkin(text, text, text, text, text, boolean) to anon, authenticated;