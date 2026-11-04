alter table public.union_station_requests
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists alternate_phone text,
  add column if not exists menu_requirements text,
  add column if not exists equipment_requirements text;

create index if not exists idx_union_station_requests_organization
  on public.union_station_requests(organization_id, created_at desc)
  where organization_id is not null;

drop policy if exists union_station_requests_organization_read on public.union_station_requests;
create policy union_station_requests_organization_read
  on public.union_station_requests for select to authenticated using (
    organization_id is not null
    and public.has_organization_role(auth.uid(), organization_id)
  );

create or replace function public.link_union_station_request_organization()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
begin
  new.organization_id := null;
  if new.submitted_by is not null then
    select membership.organization_id into v_organization_id
    from public.organization_members membership
    where membership.user_id = new.submitted_by and membership.status = 'active';
  end if;
  new.organization_id := v_organization_id;
  return new;
end;
$$;

drop trigger if exists trg_link_union_station_request_organization on public.union_station_requests;
create trigger trg_link_union_station_request_organization
before insert on public.union_station_requests
for each row execute function public.link_union_station_request_organization();

revoke all on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer) from public, anon, authenticated;

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
  if length(btrim(coalesce(p_catering, ''))) = 0
    or length(btrim(coalesce(p_menu_requirements, ''))) = 0
    or length(btrim(coalesce(p_equipment_requirements, ''))) = 0 then
    raise exception 'Catering, menu, and equipment requirements are required. Enter none if not needed.';
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
    btrim(p_layout), btrim(p_catering), btrim(p_menu_requirements),
    btrim(p_equipment_requirements), coalesce(p_av_addons, '{}'::text[]),
    nullif(btrim(p_notes), ''), p_estimate_zar, auth.uid(), v_branch_id, v_lead_id
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

revoke all on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer, text, text, text) from public;
grant execute on function public.submit_public_union_station_request(text, text, text, text, text, date, time, time, integer, text, text, text[], text, integer, text, text, text) to anon, authenticated;

create or replace function public.notify_union_station_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.submitted_by is not null then
    insert into public.notifications(profile_id, title, body, url)
    values (
      new.submitted_by,
      'Union Station enquiry received',
      new.reference || ' · Your event enquiry is with the venue team.',
      '/billing'
    );
  end if;

  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id, 'New Union Station enquiry',
    new.reference || ' · ' || new.client_company || ' · ' || new.event_type,
    '/union-station-admin'
  from public.user_roles assigned
  where assigned.user_id is distinct from new.submitted_by
    and (
      assigned.role::text in ('group_admin', 'group_ceo', 'superadmin', 'crm_manager', 'sales_manager')
      or (assigned.role::text = 'branch_manager' and assigned.branch_id = new.branch_id)
    );
  return new;
end;
$$;

drop trigger if exists trg_notify_union_station_request on public.union_station_requests;
create trigger trg_notify_union_station_request
after insert on public.union_station_requests
for each row execute function public.notify_union_station_request();

create or replace function public.notify_union_station_quote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'quoted' and old.status is distinct from 'quoted' and new.submitted_by is not null then
    insert into public.notifications(profile_id, title, body, url)
    values (
      new.submitted_by,
      'Union Station quote ready',
      new.reference || ' · Quote prepared for R' || to_char(new.estimate_zar, 'FM999G999G990'),
      '/billing'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_union_station_quote on public.union_station_requests;
create trigger trg_notify_union_station_quote
after update of status on public.union_station_requests
for each row execute function public.notify_union_station_quote();

create or replace function public.issue_union_station_invoice(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.union_station_requests%rowtype;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_reference text := 'US-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_due_at date := current_date + 7;
begin
  if auth.uid() is null then raise exception 'Sign in to issue this invoice.'; end if;

  select * into v_request
  from public.union_station_requests
  where id = p_request_id and status = 'quoted'
  for update;
  if not found then raise exception 'This request is not awaiting an invoice.'; end if;
  if v_request.estimate_zar < 1 then raise exception 'Prepare a quote before issuing an invoice.'; end if;
  if not (
    public.has_role(auth.uid(), 'finance')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.is_platform_admin(auth.uid())
    or public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), v_request.branch_id)
  ) then raise exception 'You cannot issue invoices for this branch.'; end if;

  insert into public.invoices (
    id, reference, union_request_id, organization_id, amount_zar, status, issued_at, due_at, metadata
  ) values (
    v_invoice_id, v_invoice_reference, p_request_id, v_request.organization_id,
    v_request.estimate_zar, 'sent', current_date, v_due_at,
    jsonb_build_object(
      'kind', 'union_station_event',
      'branch_id', v_request.branch_id::text,
      'request_reference', v_request.reference,
      'event_type', v_request.event_type,
      'event_date', v_request.event_date
    )
  );

  update public.union_station_requests set status = 'invoiced' where id = p_request_id;

  insert into public.union_station_approvals(request_id, actor_id, from_status, to_status, comment)
  values (p_request_id, auth.uid(), 'quoted'::public.us_status, 'invoiced'::public.us_status, 'Invoice ' || v_invoice_reference || ' issued');

  if v_request.submitted_by is not null then
    insert into public.notifications(profile_id, title, body, url)
    values (
      v_request.submitted_by,
      'Union Station invoice issued',
      v_invoice_reference || ' · R' || to_char(v_request.estimate_zar, 'FM999G999G990'),
      '/billing'
    );
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_reference', v_invoice_reference,
    'due_at', v_due_at
  );
end;
$$;

revoke all on function public.issue_union_station_invoice(uuid) from public;
grant execute on function public.issue_union_station_invoice(uuid) to authenticated;