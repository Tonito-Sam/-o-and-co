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
  p_estimate_zar integer,
  p_alternate_phone text,
  p_menu_requirements text,
  p_equipment_requirements text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_lead_id uuid;
  v_request_id uuid;
  v_booking_id uuid;
  v_reference text;
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  select id into v_branch_id from public.branches where slug = 'kyalami' and status = 'live';
  if v_branch_id is null then raise exception 'Kyalami branch is unavailable for Union Station requests.'; end if;
  if length(btrim(coalesce(p_client_company, ''))) < 2
    or length(btrim(coalesce(p_contact_name, ''))) < 2
    or length(btrim(coalesce(p_contact_email, ''))) < 5
    or p_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(btrim(coalesce(p_contact_phone, ''))) < 7
    or length(btrim(coalesce(p_event_type, ''))) < 2 then
    raise exception 'Company, contact name, valid email, WhatsApp number, and event type are required.';
  end if;
  if p_event_date is null or p_event_date < current_date or p_starts_time is null
    or p_ends_time is null or p_ends_time <= p_starts_time then
    raise exception 'Choose a valid future event date and time.';
  end if;
  if p_attendees is null or p_attendees < 1 or p_attendees > 450 then
    raise exception 'Attendees must be between 1 and 450.';
  end if;
  if length(btrim(coalesce(p_catering, ''))) = 0 then
    raise exception 'Catering selection is required.';
  end if;
  if length(coalesce(p_alternate_phone, '')) > 40
    or length(coalesce(p_menu_requirements, '')) > 2000
    or length(coalesce(p_equipment_requirements, '')) > 2000
    or length(coalesce(p_catering, '')) > 2000
    or length(coalesce(p_notes, '')) > 4000 then
    raise exception 'One or more event details exceed the allowed length.';
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
    client_company, contact_name, contact_email, contact_phone, alternate_phone,
    event_type, event_date, starts_time, ends_time, attendees, layout, catering,
    menu_requirements, equipment_requirements, av_addons, notes, estimate_zar,
    submitted_by, branch_id, lead_id
  ) values (
    btrim(p_client_company), btrim(p_contact_name), lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''), nullif(btrim(p_alternate_phone), ''),
    btrim(p_event_type), p_event_date, p_starts_time, p_ends_time, p_attendees,
    btrim(p_layout), btrim(p_catering), nullif(btrim(p_menu_requirements), ''),
    nullif(btrim(p_equipment_requirements), ''), coalesce(p_av_addons, '{}'::text[]),
    nullif(btrim(p_notes), ''), p_estimate_zar, auth.uid(), v_branch_id, v_lead_id
  ) returning id, reference into v_request_id, v_reference;

  insert into public.bookings (
    room_id, branch_id, lead_id, space_name, email_dispatch_token, booked_by,
    starts_at, ends_at, status, guests, notes
  ) values (
    null, v_branch_id, v_lead_id, 'Union Station - ' || btrim(p_event_type),
    v_email_token, auth.uid(),
    (p_event_date + p_starts_time) at time zone 'Africa/Johannesburg',
    (p_event_date + p_ends_time) at time zone 'Africa/Johannesburg',
    'held', p_attendees, nullif(btrim(p_notes), '')
  ) returning id into v_booking_id;

  update public.union_station_requests set booking_id = v_booking_id where id = v_request_id;

  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  values (
    v_booking_id,
    'request_received',
    lower(btrim(p_contact_email)),
    jsonb_build_object(
      'request_reference', v_reference,
      'contact_name', btrim(p_contact_name),
      'contact_email', lower(btrim(p_contact_email)),
      'contact_phone', btrim(p_contact_phone),
      'alternate_phone', nullif(btrim(p_alternate_phone), ''),
      'company_name', btrim(p_client_company),
      'branch_name', 'Union Station',
      'space_name', 'Union Station',
      'event_type', btrim(p_event_type),
      'booking_date', p_event_date,
      'starts_at', p_starts_time,
      'ends_at', p_ends_time,
      'guests', p_attendees,
      'layout', btrim(p_layout),
      'catering', btrim(p_catering),
      'menu_requirements', nullif(btrim(p_menu_requirements), ''),
      'equipment_requirements', nullif(btrim(p_equipment_requirements), ''),
      'av_addons', coalesce(p_av_addons, '{}'::text[]),
      'notes', nullif(btrim(p_notes), '')
    )
  );

  return jsonb_build_object(
    'id', v_request_id,
    'reference', v_reference,
    'lead_id', v_lead_id,
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'email_token', v_email_token
  );
end;
$$;

revoke all on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer, text, text, text) from public;
grant execute on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';