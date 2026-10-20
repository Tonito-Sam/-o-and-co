create or replace function public.submit_public_union_station_request(
  p_client_company text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_event_type text,
  p_event_date date,
  p_starts_time time,
  p_ends_time time,
  p_attendees integer,
  p_layout text,
  p_catering text,
  p_av_addons text[],
  p_notes text,
  p_estimate_zar integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_lead_id uuid;
  v_request_id uuid;
  v_booking_id uuid;
  v_reference text;
begin
  select id into v_branch_id from public.branches where slug = 'kyalami' and status = 'live';
  if v_branch_id is null then raise exception 'Kyalami branch is unavailable for Union Station requests.'; end if;
  if length(btrim(coalesce(p_client_company, ''))) < 2
    or length(btrim(coalesce(p_contact_name, ''))) < 2
    or length(btrim(coalesce(p_contact_email, ''))) < 5 then
    raise exception 'Company, contact name, and email are required.';
  end if;
  if p_event_date is null or p_event_date < current_date or p_starts_time is null
    or p_ends_time is null or p_ends_time <= p_starts_time then
    raise exception 'Choose a valid future event date and time.';
  end if;
  if p_attendees is null or p_attendees < 1 or p_attendees > 450 then
    raise exception 'Attendees must be between 1 and 450.';
  end if;
  if coalesce(p_estimate_zar, -1) < 0 then raise exception 'Estimate cannot be negative.'; end if;

  insert into public.leads (
    company_name, contact_name, contact_email, contact_phone, source,
    stage, sales_stage, branch_id, opportunity_type
  ) values (
    btrim(p_client_company), btrim(p_contact_name), lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''), 'Union Station public event request',
    'new_lead', 'New Lead', v_branch_id, 'event'
  ) returning id into v_lead_id;

  insert into public.union_station_requests (
    client_company, contact_name, contact_email, contact_phone, event_type,
    event_date, starts_time, ends_time, attendees, layout, catering, av_addons,
    notes, estimate_zar, submitted_by, branch_id, lead_id
  ) values (
    btrim(p_client_company), btrim(p_contact_name), lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''), btrim(p_event_type), p_event_date,
    p_starts_time, p_ends_time, p_attendees, btrim(p_layout), btrim(p_catering),
    coalesce(p_av_addons, '{}'::text[]), nullif(btrim(p_notes), ''), p_estimate_zar,
    auth.uid(), v_branch_id, v_lead_id
  ) returning id, reference into v_request_id, v_reference;

  insert into public.bookings (
    room_id, branch_id, lead_id, space_name, booked_by, starts_at, ends_at,
    status, guests, notes
  ) values (
    null, v_branch_id, v_lead_id, 'Union Station - ' || btrim(p_event_type), auth.uid(),
    (p_event_date + p_starts_time) at time zone 'Africa/Johannesburg',
    (p_event_date + p_ends_time) at time zone 'Africa/Johannesburg',
    'held', p_attendees, nullif(btrim(p_notes), '')
  ) returning id into v_booking_id;

  update public.union_station_requests set booking_id = v_booking_id where id = v_request_id;
  return jsonb_build_object(
    'id', v_request_id, 'reference', v_reference, 'lead_id', v_lead_id,
    'booking_id', v_booking_id, 'branch_id', v_branch_id
  );
end;
$$;

revoke all on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer) from public;
grant execute on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer) to anon, authenticated;

create or replace function public.get_public_union_station_calendar(p_from date default current_date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'reference', reference,
    'event_type', event_type,
    'event_date', event_date,
    'starts_time', starts_time,
    'ends_time', ends_time,
    'attendees', attendees,
    'layout', layout,
    'status', status::text
  ) order by event_date, starts_time), '[]'::jsonb)
  from public.union_station_requests
  where event_date >= coalesce(p_from, current_date)
    and status in ('confirmed', 'invoiced', 'completed');
$$;
revoke all on function public.get_public_union_station_calendar(date) from public;
grant execute on function public.get_public_union_station_calendar(date) to anon, authenticated;
