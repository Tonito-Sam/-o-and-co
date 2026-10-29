alter table public.bookings
  add column if not exists request_reference text,
  add column if not exists request_status text,
  add column if not exists quote_amount_zar integer,
  add column if not exists quote_notes text,
  add column if not exists quote_submitted_at timestamptz,
  add column if not exists invoice_sent_at timestamptz,
  add column if not exists email_dispatch_token text;

alter table public.bookings drop constraint if exists bookings_request_status_check;
alter table public.bookings add constraint bookings_request_status_check
  check (request_status is null or request_status in ('pending_review', 'quoted', 'invoice_sent', 'confirmed', 'declined'));
update public.bookings request set
  request_status = case when invoice_reference is null then 'pending_review' else 'invoice_sent' end,
  request_reference = coalesce(request.request_reference, 'OCO-RQ-' || upper(substr(replace(request.id::text, '-', ''), 1, 10)))
from public.leads lead
where lead.id = request.lead_id and lead.source = 'Website one-off booking'
  and request.request_status is null and request.status = 'held';
create unique index if not exists idx_bookings_request_reference
  on public.bookings(request_reference) where request_reference is not null;
create index if not exists idx_bookings_request_status
  on public.bookings(request_status, starts_at) where request_status is not null;

create table if not exists public.booking_email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event text not null check (event in ('request_received', 'finance_quote_ready', 'invoice_sent', 'booking_confirmed', 'booking_declined')),
  recipient_email text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (booking_id, event, recipient_email)
);
alter table public.booking_email_outbox enable row level security;
revoke all on public.booking_email_outbox from anon, authenticated;
grant all on public.booking_email_outbox to service_role;

drop policy if exists bookings_one_off_staff_read on public.bookings;
create policy bookings_one_off_staff_read on public.bookings for select to authenticated using (
  request_status is not null and (
    public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
    or exists (
      select 1 from public.user_roles assigned
      where assigned.user_id = auth.uid()
        and assigned.role::text in ('rosebank_sales', 'sales_manager')
        and (assigned.branch_id = branch_id or (assigned.role::text = 'sales_manager' and assigned.branch_id is null))
    )
    or (request_status in ('quoted', 'invoice_sent', 'confirmed') and public.has_role(auth.uid(), 'finance'))
  )
);

drop policy if exists leads_finance_quoted_booking_read on public.leads;
create policy leads_finance_quoted_booking_read on public.leads for select to authenticated using (
  public.has_role(auth.uid(), 'finance') and exists (
    select 1 from public.bookings request
    where request.lead_id = leads.id and request.request_status in ('quoted', 'invoice_sent', 'confirmed')
  )
);

drop policy if exists leads_branch_sales_booking_read on public.leads;
create policy leads_branch_sales_booking_read on public.leads for select to authenticated using (
  exists (
    select 1 from public.bookings request
    join public.user_roles assigned on assigned.user_id = auth.uid()
    where request.lead_id = leads.id
      and assigned.role::text = 'rosebank_sales'
      and assigned.branch_id = request.branch_id
  )
);

create or replace function public.create_public_one_off_booking(
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_company_name text,
  p_branch_name text,
  p_space_name text,
  p_booking_date date,
  p_starts_at time,
  p_ends_at time,
  p_guests integer,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_branch_name text;
  v_lead_id uuid;
  v_booking_id uuid;
  v_reference text := 'OCO-RQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_payload jsonb;
begin
  if length(btrim(coalesce(p_contact_name, ''))) < 2
    or length(btrim(coalesce(p_company_name, ''))) < 2
    or length(btrim(coalesce(p_contact_email, ''))) < 5
    or length(btrim(coalesce(p_contact_phone, ''))) < 5
    or length(btrim(coalesce(p_space_name, ''))) < 2 then
    raise exception 'Complete your contact, company, and booking details.';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 1000 then raise exception 'Choose a valid guest count.'; end if;
  if p_booking_date is null or p_booking_date < current_date or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Choose a valid future booking date and time.';
  end if;
  if length(p_contact_name) > 160 or length(p_company_name) > 160
    or length(p_contact_email) > 254 or length(p_contact_phone) > 40
    or length(p_space_name) > 160 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'One or more booking details exceed the allowed length.';
  end if;

  select id, name into v_branch_id, v_branch_name from public.branches
  where status = 'live' and (lower(name) = lower(btrim(p_branch_name)) or lower(slug) = lower(btrim(p_branch_name)))
  limit 1;
  if v_branch_id is null then raise exception 'Choose an active Office & Co branch.'; end if;
  v_starts := (p_booking_date + p_starts_at) at time zone 'Africa/Johannesburg';
  v_ends := (p_booking_date + p_ends_at) at time zone 'Africa/Johannesburg';
  if v_starts <= now() then raise exception 'Booking time must be in the future.'; end if;

  insert into public.leads (
    company_name, contact_name, contact_email, contact_phone, source,
    stage, sales_stage, branch_id, opportunity_type
  ) values (
    btrim(p_company_name), btrim(p_contact_name), lower(btrim(p_contact_email)),
    btrim(p_contact_phone), 'Website one-off booking', 'new_lead', 'New Lead', v_branch_id, 'event'
  ) returning id into v_lead_id;

  insert into public.bookings (
    room_id, branch_id, lead_id, space_name, request_reference, email_dispatch_token, booked_by, starts_at, ends_at,
    status, request_status, guests, notes
  ) values (
    null, v_branch_id, v_lead_id, btrim(p_space_name), v_reference, v_email_token, null, v_starts, v_ends,
    'held', 'pending_review', p_guests, nullif(btrim(p_notes), '')
  ) returning id into v_booking_id;

  v_payload := jsonb_build_object(
    'request_reference', v_reference,
    'contact_name', btrim(p_contact_name),
    'company_name', btrim(p_company_name),
    'branch_name', v_branch_name,
    'space_name', btrim(p_space_name),
    'booking_date', p_booking_date,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'guests', p_guests,
    'notes', nullif(btrim(p_notes), '')
  );

  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  values (v_booking_id, 'request_received', lower(btrim(p_contact_email)), v_payload);

  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  select distinct v_booking_id, 'request_received', lower(btrim(profile.email)),
    v_payload || jsonb_build_object('internal', true)
  from public.user_roles assigned
  join public.profiles profile on profile.id = assigned.user_id
  where nullif(btrim(profile.email), '') is not null
    and (
      assigned.role::text in ('superadmin', 'group_admin', 'group_ceo', 'crm_manager')
      or (assigned.role::text = 'branch_manager' and assigned.branch_id = v_branch_id)
      or (assigned.role::text = 'rosebank_sales' and assigned.branch_id = v_branch_id)
      or (assigned.role::text = 'sales_manager' and (assigned.branch_id = v_branch_id or assigned.branch_id is null))
    )
  on conflict (booking_id, event, recipient_email) do nothing;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'booking_id', v_booking_id,
    'reference', v_reference,
    'branch_id', v_branch_id,
    'email_token', v_email_token
  );
end;
$$;

create or replace function public.submit_one_off_booking_quote(
  p_booking_id uuid,
  p_quote_amount_zar integer,
  p_quote_notes text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_booking record;
  v_payload jsonb;
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if auth.uid() is null then raise exception 'Sign in to prepare a booking quote.'; end if;
  if p_quote_amount_zar is null or p_quote_amount_zar < 1 or p_quote_amount_zar > 10000000 then
    raise exception 'Enter a valid quote amount.';
  end if;
  if length(coalesce(p_quote_notes, '')) > 2000 then raise exception 'Quote notes are too long.'; end if;

  select request.branch_id into v_branch_id
  from public.bookings request
  where request.id = p_booking_id and request.request_status = 'pending_review'
  for update;
  if v_branch_id is null then raise exception 'This request is no longer awaiting a quote.'; end if;
  if not (
    public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), v_branch_id)
    or exists (
      select 1 from public.user_roles assigned
      where assigned.user_id = auth.uid()
        and assigned.role::text = 'rosebank_sales'
        and assigned.branch_id = v_branch_id
    )
  ) then raise exception 'You cannot prepare quotes for this branch.'; end if;

  update public.bookings set
    quote_amount_zar = p_quote_amount_zar,
    quote_notes = nullif(btrim(p_quote_notes), ''),
    quote_submitted_at = now(),
    email_dispatch_token = v_email_token,
    request_status = 'quoted'
  where id = p_booking_id
  returning * into v_booking;
  update public.leads set stage = 'proposal_sent', sales_stage = 'Proposal Sent'
  where id = v_booking.lead_id;

  select jsonb_build_object(
    'request_reference', v_booking.request_reference,
    'quote_amount_zar', v_booking.quote_amount_zar,
    'quote_notes', v_booking.quote_notes,
    'space_name', v_booking.space_name,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at
  ) into v_payload;

  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  select distinct p_booking_id, 'finance_quote_ready', lower(btrim(profile.email)),
    v_payload || jsonb_build_object('internal', true, 'branch_id', v_branch_id)
  from public.user_roles finance
  join public.profiles profile on profile.id = finance.user_id
  where finance.role::text = 'finance' and nullif(btrim(profile.email), '') is not null
  on conflict (booking_id, event, recipient_email) do nothing;
  return v_email_token;
end;
$$;

create or replace function public.issue_one_off_booking_invoice(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_reference text := 'OCO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_due_at date := current_date + 7;
  v_payload jsonb;
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'finance') or public.has_role(auth.uid(), 'group_ceo') or public.is_platform_admin(auth.uid())
  ) then raise exception 'Finance access is required to issue this invoice.'; end if;

  select request.*, lead.contact_name, lead.company_name, lead.contact_email, branch.name as branch_name
  into v_booking
  from public.bookings request
  join public.leads lead on lead.id = request.lead_id
  join public.branches branch on branch.id = request.branch_id
  where request.id = p_booking_id and request.request_status = 'quoted'
  for update of request;
  if not found then raise exception 'This request is no longer awaiting finance.'; end if;

  insert into public.invoices (id, reference, booking_id, amount_zar, status, issued_at, due_at, metadata)
  values (
    v_invoice_id, v_invoice_reference, p_booking_id, v_booking.quote_amount_zar, 'sent', current_date, v_due_at,
    jsonb_build_object(
      'kind', 'one_off_booking', 'lead_id', v_booking.lead_id, 'branch_id', v_booking.branch_id,
      'request_reference', v_booking.request_reference, 'space_name', v_booking.space_name,
      'guests', v_booking.guests, 'quote_notes', v_booking.quote_notes
    )
  );

  update public.bookings set
    request_status = 'invoice_sent', invoice_reference = v_invoice_reference,
    invoice_sent_at = now(), email_dispatch_token = v_email_token
  where id = p_booking_id;

  v_payload := jsonb_build_object(
    'request_reference', v_booking.request_reference,
    'invoice_reference', v_invoice_reference,
    'contact_name', v_booking.contact_name,
    'company_name', v_booking.company_name,
    'branch_name', v_booking.branch_name,
    'space_name', v_booking.space_name,
    'booking_date', (v_booking.starts_at at time zone 'Africa/Johannesburg')::date,
    'starts_at', (v_booking.starts_at at time zone 'Africa/Johannesburg')::time,
    'ends_at', (v_booking.ends_at at time zone 'Africa/Johannesburg')::time,
    'guests', v_booking.guests,
    'amount_zar', v_booking.quote_amount_zar,
    'due_at', v_due_at
  );
  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  values (p_booking_id, 'invoice_sent', lower(btrim(v_booking.contact_email)), v_payload)
  on conflict (booking_id, event, recipient_email) do nothing;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_reference', v_invoice_reference,
    'due_at', v_due_at,
    'email_token', v_email_token
  );
end;
$$;

drop function if exists public.update_one_off_booking_status(uuid, text);
create function public.update_one_off_booking_status(p_booking_id uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings%rowtype;
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_event text;
  v_payload jsonb;
  v_contact record;
begin
  if p_status not in ('confirmed', 'cancelled') then raise exception 'Choose a valid booking status.'; end if;
  select * into v_booking from public.bookings where id = p_booking_id and request_status is not null for update;
  if not found then raise exception 'Booking request not found.'; end if;
  if not (
    public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), v_booking.branch_id)
    or exists (
      select 1 from public.user_roles assigned
      where assigned.user_id = auth.uid() and assigned.role::text = 'rosebank_sales'
        and assigned.branch_id = v_booking.branch_id
    )
  ) then raise exception 'You cannot manage booking requests for this branch.'; end if;
  if p_status = 'confirmed' and v_booking.request_status <> 'invoice_sent' then
    raise exception 'A booking can only be confirmed after Finance issues its invoice.';
  end if;
  if p_status = 'cancelled' and v_booking.request_status not in ('pending_review', 'quoted') then
    raise exception 'This booking request can no longer be declined.';
  end if;
  select lead.contact_name, lead.contact_email, branch.name as branch_name
  into v_contact
  from public.leads lead
  join public.branches branch on branch.id = v_booking.branch_id
  where lead.id = v_booking.lead_id;
  v_event := case when p_status = 'confirmed' then 'booking_confirmed' else 'booking_declined' end;
  update public.bookings set
    status = case when p_status = 'cancelled' then 'cancelled'::public.booking_status else 'confirmed'::public.booking_status end,
    request_status = case when p_status = 'cancelled' then 'declined' else 'confirmed' end,
    email_dispatch_token = v_email_token
  where id = p_booking_id;
  v_payload := jsonb_build_object(
    'request_reference', v_booking.request_reference,
    'invoice_reference', v_booking.invoice_reference,
    'contact_name', v_contact.contact_name,
    'branch_name', v_contact.branch_name,
    'space_name', v_booking.space_name,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at
  );
  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  values (p_booking_id, v_event, lower(btrim(v_contact.contact_email)), v_payload)
  on conflict (booking_id, event, recipient_email) do nothing;
  return v_email_token;
end;
$$;

create or replace function public.notify_branch_booking_managers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_space text := coalesce(new.space_name, 'Space booking');
  v_reference text := coalesce(new.request_reference, new.invoice_reference, 'Booking request');
begin
  v_branch_id := coalesce(new.branch_id, (select branch_id from public.rooms where id = new.room_id));
  if v_branch_id is null then return new; end if;
  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id, 'New booking request · ' || branch.name,
    v_reference || ' · ' || v_space || ' · ' || to_char(new.starts_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI'), '/bookings'
  from public.user_roles assigned
  join public.branches branch on branch.id = v_branch_id
  where assigned.role::text in ('group_admin', 'group_ceo', 'superadmin', 'crm_manager')
     or (assigned.role::text = 'branch_manager' and assigned.branch_id = v_branch_id)
     or (assigned.role::text = 'rosebank_sales' and assigned.branch_id = v_branch_id)
     or (assigned.role::text = 'sales_manager' and (assigned.branch_id = v_branch_id or assigned.branch_id is null));
  return new;
end;
$$;

create or replace function public.notify_finance_booking_quote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_status = 'quoted' and old.request_status is distinct from 'quoted' then
    insert into public.notifications(profile_id, title, body, url)
    select finance.user_id, 'Booking quote ready for finance',
      coalesce(new.request_reference, 'Booking request') || ' · R' || to_char(new.quote_amount_zar, 'FM999G999G990'), '/billing'
    from public.user_roles finance
    where finance.role::text = 'finance';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_finance_booking_quote on public.bookings;
create trigger trg_notify_finance_booking_quote after update of request_status on public.bookings
for each row execute function public.notify_finance_booking_quote();

revoke all on function public.create_public_one_off_booking(text, text, text, text, text, text, date, time, time, integer, text) from public;
grant execute on function public.create_public_one_off_booking(text, text, text, text, text, text, date, time, time, integer, text) to anon, authenticated;
revoke all on function public.submit_one_off_booking_quote(uuid, integer, text) from public;
grant execute on function public.submit_one_off_booking_quote(uuid, integer, text) to authenticated;
revoke all on function public.issue_one_off_booking_invoice(uuid) from public;
grant execute on function public.issue_one_off_booking_invoice(uuid) to authenticated;
revoke all on function public.update_one_off_booking_status(uuid, text) from public;
grant execute on function public.update_one_off_booking_status(uuid, text) to authenticated;