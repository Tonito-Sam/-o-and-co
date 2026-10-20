alter table public.tenants
  alter column company_id drop not null,
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists lease_signed_at date,
  add column if not exists status text not null default 'active',
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null;

alter table public.tenants drop constraint if exists tenants_identity_check;
alter table public.tenants add constraint tenants_identity_check
  check (company_id is not null or organization_id is not null);
alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('active', 'ended', 'cancelled'));

alter table public.leads
  add column if not exists sales_stage text not null default 'New Lead',
  add column if not exists contact_phone text,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists opportunity_type text not null default 'workspace',
  add column if not exists tour_at timestamptz,
  add column if not exists tour_branch_id uuid references public.branches(id);

alter table public.leads drop constraint if exists leads_sales_stage_check;
alter table public.leads add constraint leads_sales_stage_check
  check (sales_stage in (
    'New Lead', 'Contacted', 'Qualified', 'Tour Scheduled', 'Proposal Sent',
    'Negotiation', 'Contract Sent', 'Contract Signed', 'Onboarding',
    'Active Tenant', 'Lost'
  ));
alter table public.leads drop constraint if exists leads_opportunity_type_check;
alter table public.leads add constraint leads_opportunity_type_check
  check (opportunity_type in ('workspace', 'event', 'other'));

update public.leads set sales_stage = case stage
  when 'new_lead' then 'New Lead'
  when 'contacted' then 'Contacted'
  when 'qualified' then 'Qualified'
  when 'tour_scheduled' then 'Tour Scheduled'
  when 'proposal_sent' then 'Proposal Sent'
  when 'negotiation' then 'Negotiation'
  when 'won' then 'Contract Signed'
  when 'lost' then 'Lost'
end;

alter table public.organizations
  add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.branch_resource_bookings
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

alter table public.bookings
  alter column room_id drop not null,
  add column if not exists branch_id uuid references public.branches(id),
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists space_name text,
  add column if not exists invoice_reference text;
alter table public.bookings drop constraint if exists bookings_room_or_space_check;
alter table public.bookings add constraint bookings_room_or_space_check
  check (room_id is not null or nullif(btrim(space_name), '') is not null);
create index if not exists idx_leads_sales_stage on public.leads(sales_stage);
create index if not exists idx_leads_organization on public.leads(organization_id);
create index if not exists idx_bookings_lead on public.bookings(lead_id) where lead_id is not null;
create unique index if not exists idx_organizations_lead_unique on public.organizations(lead_id)
  where lead_id is not null;
create unique index if not exists idx_tenants_source_lead on public.tenants(source_lead_id)
  where source_lead_id is not null;

update public.tenants t
set organization_id = o.id
from public.organizations o
join public.companies c
  on lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g')) = o.normalized_name
where t.company_id = c.id and t.organization_id is null;

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_activities_lead on public.lead_activities(lead_id, created_at desc);
alter table public.lead_activities enable row level security;
drop policy if exists lead_activities_staff_read on public.lead_activities;
create policy lead_activities_staff_read on public.lead_activities for select to authenticated
  using (public.is_office_co_staff(auth.uid()));
grant select on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;

create or replace function public.is_sales_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('superadmin', 'group_ceo', 'sales_manager', 'rosebank_sales', 'branch_manager', 'finance')
  );
$$;

create or replace function public.record_lead_stage_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (lead_id, to_stage, actor_id)
    values (new.id, new.sales_stage, auth.uid());
  elsif new.sales_stage is distinct from old.sales_stage then
    insert into public.lead_activities (lead_id, from_stage, to_stage, actor_id)
    values (new.id, old.sales_stage, new.sales_stage, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.require_tenant_before_active_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sales_stage = 'Active Tenant' and (
    new.opportunity_type <> 'workspace'
    or not exists (
      select 1 from public.tenants t
      where t.source_lead_id = new.id and t.status = 'active'
    )
  ) then
    raise exception 'A workspace tenant record must exist before the lead can be marked Active Tenant.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_require_tenant_before_active_stage on public.leads;
create trigger trg_require_tenant_before_active_stage
before update of sales_stage on public.leads
for each row execute function public.require_tenant_before_active_stage();

drop trigger if exists trg_lead_stage_activity on public.leads;
drop trigger if exists trg_lead_stage_activity_insert on public.leads;
drop trigger if exists trg_lead_stage_activity_update on public.leads;
create trigger trg_lead_stage_activity_insert
after insert on public.leads
for each row execute function public.record_lead_stage_activity();
create trigger trg_lead_stage_activity_update
after update of sales_stage on public.leads
for each row execute function public.record_lead_stage_activity();

create or replace function public.link_registered_organization_to_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select lower(email) into v_email from public.profiles where id = new.created_by;
  select l.id into new.lead_id
  from public.leads l
  where lower(regexp_replace(btrim(l.company_name), '[[:space:]]+', ' ', 'g')) = new.normalized_name
    and l.sales_stage not in ('Active Tenant', 'Lost')
    and l.organization_id is null
    and (l.contact_email is null or lower(l.contact_email) = v_email)
  order by l.created_at desc
  limit 1;
  return new;
end;
$$;
drop trigger if exists trg_organization_link_lead on public.organizations;
create trigger trg_organization_link_lead
before insert on public.organizations
for each row execute function public.link_registered_organization_to_lead();

create or replace function public.mark_registered_organization_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    update public.leads set organization_id = new.id where id = new.lead_id;
  end if;
  update public.tenants t
  set organization_id = new.id
  from public.companies c
  where t.company_id = c.id and t.organization_id is null
    and lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g')) = new.normalized_name;
  return new;
end;
$$;
drop trigger if exists trg_organization_mark_lead on public.organizations;
create trigger trg_organization_mark_lead
after insert on public.organizations
for each row execute function public.mark_registered_organization_on_lead();

create or replace function public.link_existing_organization_to_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
begin
  select id into v_organization_id
  from public.organizations
  where normalized_name = lower(regexp_replace(btrim(new.company_name), '[[:space:]]+', ' ', 'g'))
  limit 1;
  if v_organization_id is not null then
    update public.leads set organization_id = v_organization_id where id = new.id;
    update public.organizations set lead_id = new.id where id = v_organization_id and lead_id is null;
  end if;
  return new;
end;
$$;

create or replace function public.submit_website_sales_lead(
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_company_name text,
  p_source text,
  p_branch_name text default null,
  p_opportunity_type text default 'workspace'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead_id uuid;
  v_branch_id uuid;
begin
  if length(btrim(coalesce(p_contact_name, ''))) < 2
    or length(btrim(coalesce(p_company_name, ''))) < 2
    or length(btrim(coalesce(p_contact_email, ''))) < 5 then
    raise exception 'Complete your name, company, and email address.';
  end if;
  if length(p_contact_name) > 160 or length(p_company_name) > 160
    or length(p_contact_email) > 254 or length(coalesce(p_contact_phone, '')) > 40
    or length(coalesce(p_source, '')) > 120 then
    raise exception 'One or more details exceed the allowed length.';
  end if;
  if coalesce(p_opportunity_type, 'workspace') not in ('workspace', 'event', 'other') then
    raise exception 'Choose a valid opportunity type.';
  end if;
  select id into v_branch_id from public.branches
  where status = 'live' and (lower(name) = lower(btrim(p_branch_name)) or lower(slug) = lower(btrim(p_branch_name)))
  limit 1;

  insert into public.leads (
    company_name, contact_name, contact_email, contact_phone, source,
    stage, sales_stage, branch_id, opportunity_type
  ) values (
    btrim(p_company_name), btrim(p_contact_name), lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''), coalesce(nullif(btrim(p_source), ''), 'Website inquiry'),
    'new_lead', 'New Lead', v_branch_id, coalesce(p_opportunity_type, 'workspace')
  ) returning id into v_lead_id;
  return v_lead_id;
end;
$$;
drop trigger if exists trg_lead_link_registered_organization on public.leads;
create trigger trg_lead_link_registered_organization
after insert on public.leads
for each row execute function public.link_existing_organization_to_lead();

create or replace function public.link_lead_to_organization(p_lead_id uuid, p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_staff(auth.uid()) then raise exception 'Only Office & Co staff can link organizations to leads.'; end if;
  if not exists (select 1 from public.leads where id = p_lead_id) then raise exception 'Lead not found.'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Organization not found.'; end if;
  update public.organizations set lead_id = null where lead_id = p_lead_id and id <> p_organization_id;
  update public.organizations set lead_id = p_lead_id where id = p_organization_id and lead_id is null;
  update public.leads set organization_id = p_organization_id where id = p_lead_id;
end;
$$;

create or replace function public.submit_website_tour_request(
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_company_name text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead_id uuid;
begin
  if length(btrim(coalesce(p_contact_name, ''))) < 2
    or length(btrim(coalesce(p_company_name, ''))) < 2
    or length(btrim(coalesce(p_contact_email, ''))) < 5
    or length(btrim(coalesce(p_contact_phone, ''))) < 5 then
    raise exception 'Complete your name, company, email, and phone number.';
  end if;
  if length(p_contact_name) > 160 or length(p_company_name) > 160
    or length(p_contact_email) > 254 or length(p_contact_phone) > 40 then
    raise exception 'One or more details exceed the allowed length.';
  end if;

  insert into public.leads (
    company_name, contact_name, contact_email, contact_phone, source, stage, sales_stage
  ) values (
    btrim(p_company_name), btrim(p_contact_name), lower(btrim(p_contact_email)),
    btrim(p_contact_phone), 'Website tour request', 'new_lead', 'New Lead'
  ) returning id into v_lead_id;
  return v_lead_id;
end;
$$;

create or replace function public.schedule_website_tour(
  p_lead_id uuid,
  p_branch_id uuid,
  p_tour_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead_id uuid;
begin
  if p_tour_at is null or p_tour_at <= now() then
    raise exception 'Choose a future tour time.';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Choose an active Office & Co branch.';
  end if;

  update public.leads
  set branch_id = p_branch_id, tour_branch_id = p_branch_id, tour_at = p_tour_at,
      stage = 'tour_scheduled', sales_stage = 'Tour Scheduled'
  where id = p_lead_id and source = 'Website tour request'
  returning id into v_lead_id;
  if v_lead_id is null then raise exception 'Tour request not found. Please submit your details again.'; end if;
  return v_lead_id;
end;
$$;

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
  v_lead_id uuid;
  v_booking_id uuid;
  v_invoice_id uuid := gen_random_uuid();
  v_reference text := 'OCO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_amount integer := 4500;
  v_starts timestamptz;
  v_ends timestamptz;
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

  select id into v_branch_id from public.branches
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
    room_id, branch_id, lead_id, space_name, invoice_reference, booked_by, starts_at, ends_at,
    status, guests, notes
  ) values (
    null, v_branch_id, v_lead_id, btrim(p_space_name), v_reference, null, v_starts, v_ends,
    'held', p_guests, nullif(btrim(p_notes), '')
  ) returning id into v_booking_id;

  insert into public.invoices (
    id, reference, booking_id, amount_zar, status, issued_at, due_at, metadata
  ) values (
    v_invoice_id, v_reference, v_booking_id, v_amount, 'sent', current_date,
    current_date + 7,
    jsonb_build_object('kind', 'one_off_booking', 'lead_id', v_lead_id,
      'branch_id', v_branch_id, 'space_name', btrim(p_space_name), 'guests', p_guests)
  );

  return jsonb_build_object(
    'lead_id', v_lead_id, 'booking_id', v_booking_id, 'invoice_id', v_invoice_id,
    'reference', v_reference, 'amount_zar', v_amount, 'due_at', current_date + 7,
    'branch_id', v_branch_id
  );
end;
$$;

create or replace function public.capture_organization_room_booking_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_organization_id uuid;
  v_company_name text;
  v_contact_name text;
  v_contact_email text;
  v_branch_id uuid;
  v_lead_id uuid;
begin
  if new.lead_id is not null or new.booked_by is null then return new; end if;
  select m.organization_id, o.name, p.full_name, p.email, coalesce(new.branch_id, r.branch_id)
  into v_organization_id, v_company_name, v_contact_name, v_contact_email, v_branch_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  join public.profiles p on p.id = m.user_id
  left join public.rooms r on r.id = new.room_id
  where m.user_id = new.booked_by and m.status = 'active'
  limit 1;
  if v_organization_id is null then return new; end if;

  insert into public.leads (
    company_name, contact_name, contact_email, source, stage, sales_stage,
    branch_id, organization_id, opportunity_type
  ) values (
    v_company_name, v_contact_name, v_contact_email, 'Organization room booking',
    'new_lead', 'New Lead', v_branch_id, v_organization_id, 'event'
  ) returning id into v_lead_id;
  update public.bookings set lead_id = v_lead_id where id = new.id;
  new.lead_id := v_lead_id;
  return new;
end;
$$;
drop trigger if exists trg_capture_organization_room_booking_lead on public.bookings;
create trigger trg_capture_organization_room_booking_lead
after insert on public.bookings
for each row execute function public.capture_organization_room_booking_lead();

create or replace function public.capture_organization_resource_booking_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_company_name text;
  v_contact_name text;
  v_contact_email text;
  v_lead_id uuid;
begin
  if new.lead_id is not null or new.organization_id is null then return new; end if;
  select o.name, p.full_name, p.email into v_company_name, v_contact_name, v_contact_email
  from public.organizations o
  join public.organization_members m on m.organization_id = o.id
  join public.profiles p on p.id = m.user_id
  where o.id = new.organization_id and m.user_id = new.booked_by and m.status = 'active';
  if v_company_name is null then return new; end if;

  insert into public.leads (
    company_name, contact_name, contact_email, source, stage, sales_stage,
    branch_id, organization_id, opportunity_type
  ) values (
    v_company_name, v_contact_name, v_contact_email, 'Organization resource booking',
    'new_lead', 'New Lead', new.branch_id, new.organization_id, 'event'
  ) returning id into v_lead_id;
  update public.branch_resource_bookings set lead_id = v_lead_id where id = new.id;
  new.lead_id := v_lead_id;
  return new;
end;
$$;
drop trigger if exists trg_capture_organization_resource_booking_lead on public.branch_resource_bookings;
create trigger trg_capture_organization_resource_booking_lead
after insert on public.branch_resource_bookings
for each row execute function public.capture_organization_resource_booking_lead();

create or replace function public.update_one_off_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_office_co_staff(auth.uid()) then raise exception 'Only Office & Co staff can update booking requests.'; end if;
  if p_status not in ('confirmed', 'cancelled') then raise exception 'Choose a valid booking status.'; end if;
  update public.bookings
  set status = p_status::public.booking_status
  where id = p_booking_id and lead_id is not null and status = 'held';
  if not found then raise exception 'Pending one-off booking request not found.'; end if;
end;
$$;

create or replace function public.import_existing_tenant(
  p_organization_name text,
  p_branch text,
  p_tier text,
  p_plan_name text,
  p_desks integer,
  p_mrr_zar integer,
  p_since date,
  p_lease_signed_at date,
  p_website text default null,
  p_industry text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_organization_id uuid;
  v_branch_id uuid;
  v_tenant_id uuid;
  v_name text := btrim(coalesce(p_organization_name, ''));
  v_normalized_name text;
begin
  if not public.is_sales_staff(auth.uid()) then raise exception 'Only Office & Co staff can import tenants.'; end if;
  if length(v_name) < 2 then raise exception 'Organization name is required.'; end if;
  if p_since is null then raise exception 'Lease start date is required.'; end if;
  if coalesce(p_desks, -1) < 0 or coalesce(p_mrr_zar, -1) < 0 then raise exception 'Desks and monthly fee cannot be negative.'; end if;

  select id into v_branch_id from public.branches
  where status = 'live' and (lower(slug) = lower(btrim(p_branch)) or lower(name) = lower(btrim(p_branch)))
  limit 1;
  if v_branch_id is null then raise exception 'Branch not found or not active: %', p_branch; end if;

  v_normalized_name := lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));
  select id into v_organization_id from public.organizations where normalized_name = v_normalized_name limit 1;
  select id into v_company_id from public.companies
  where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = v_normalized_name
  order by created_at limit 1;
  if v_company_id is null then
    insert into public.companies (name, industry, domain)
    values (v_name, nullif(btrim(p_industry), ''), nullif(lower(regexp_replace(coalesce(p_website, ''), '^https?://(www[.])?', '', 'i')), ''))
    returning id into v_company_id;
  end if;

  select id into v_tenant_id from public.tenants
  where branch_id = v_branch_id and status = 'active'
    and (
      organization_id = v_organization_id
      or company_id in (
        select id from public.companies
        where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = v_normalized_name
      )
    )
  order by created_at limit 1;

  if v_tenant_id is null then
    insert into public.tenants (
      company_id, organization_id, branch_id, tier, plan_name, desks, mrr_zar,
      since, lease_signed_at, status
    ) values (
      v_company_id, v_organization_id, v_branch_id, p_tier::public.subscription_tier,
      nullif(btrim(p_plan_name), ''), p_desks, p_mrr_zar, p_since, p_lease_signed_at, 'active'
    ) returning id into v_tenant_id;
  else
    update public.tenants set
      company_id = v_company_id, organization_id = coalesce(v_organization_id, organization_id),
      tier = p_tier::public.subscription_tier, plan_name = nullif(btrim(p_plan_name), ''),
      desks = p_desks, mrr_zar = p_mrr_zar, since = p_since,
      lease_signed_at = coalesce(p_lease_signed_at, lease_signed_at), status = 'active'
    where id = v_tenant_id;
  end if;
  return v_tenant_id;
end;
$$;

create or replace function public.import_existing_tenants(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_index integer := 0;
  v_imported integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_sales_staff(auth.uid()) then raise exception 'Only Office & Co staff can import tenants.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Provide tenant rows as a CSV roster.';
  end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'Provide at least one tenant row.'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Import no more than 500 tenants at a time.'; end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      perform public.import_existing_tenant(
        v_row->>'organization_name', v_row->>'branch', v_row->>'tier',
        v_row->>'plan_name', (v_row->>'desks')::integer, (v_row->>'mrr_zar')::integer,
        (v_row->>'since')::date, nullif(v_row->>'lease_signed_at', '')::date,
        v_row->>'website', v_row->>'industry'
      );
      v_imported := v_imported + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_index, 'organization_name', v_row->>'organization_name', 'error', sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('imported', v_imported, 'errors', v_errors);
end;
$$;

create or replace function public.activate_lead_as_tenant(
  p_lead_id uuid,
  p_branch_id uuid,
  p_tier text,
  p_plan_name text,
  p_desks integer,
  p_mrr_zar integer,
  p_since date,
  p_lease_signed_at date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads%rowtype;
  v_branch_id uuid;
  v_tenant_id uuid;
  v_existing_source_lead uuid;
begin
  if not public.is_sales_staff(auth.uid()) then raise exception 'Only Office & Co staff can activate tenants.'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if v_lead.opportunity_type <> 'workspace' then raise exception 'Only a workspace lease opportunity can create a tenant.'; end if;
  if v_lead.organization_id is null then raise exception 'Register and link the organization before activating its lease.'; end if;
  if v_lead.sales_stage not in ('Contract Signed', 'Onboarding', 'Active Tenant') then
    raise exception 'Move the lead to Contract Signed before activating a tenant.';
  end if;
  if v_lead.sales_stage in ('Onboarding', 'Active Tenant') and not exists (
    select 1 from public.lead_activities
    where lead_id = p_lead_id and to_stage = 'Contract Signed'
  ) then
    raise exception 'Record the signed contract stage before activating a tenant.';
  end if;
  if p_since is null or p_lease_signed_at is null then raise exception 'Lease signed and start dates are required.'; end if;
  if coalesce(p_desks, -1) < 0 or coalesce(p_mrr_zar, -1) < 0 then raise exception 'Desks and monthly fee cannot be negative.'; end if;

  v_branch_id := coalesce(p_branch_id, v_lead.branch_id, (select branch_id from public.organizations where id = v_lead.organization_id));
  if v_branch_id is null or not exists (select 1 from public.branches where id = v_branch_id and status = 'live') then
    raise exception 'Choose an active Office & Co branch.';
  end if;

  select id, source_lead_id into v_tenant_id, v_existing_source_lead
  from public.tenants
  where source_lead_id = p_lead_id
     or (organization_id = v_lead.organization_id and branch_id = v_branch_id and status = 'active')
  order by (source_lead_id = p_lead_id) desc nulls last
  limit 1
  for update;
  if v_tenant_id is not null and v_existing_source_lead is not null and v_existing_source_lead <> p_lead_id then
    raise exception 'This organization already has a separate active lease at the selected branch.';
  end if;
  if v_tenant_id is null then
    insert into public.tenants (
      organization_id, company_id, source_lead_id, branch_id, tier, plan_name,
      desks, mrr_zar, since, lease_signed_at, status
    ) values (
      v_lead.organization_id, null, p_lead_id, v_branch_id, p_tier::public.subscription_tier,
      nullif(btrim(p_plan_name), ''), p_desks, p_mrr_zar, p_since, p_lease_signed_at, 'active'
    ) returning id into v_tenant_id;
  else
    update public.tenants set
      organization_id = v_lead.organization_id, source_lead_id = p_lead_id,
      branch_id = v_branch_id, tier = p_tier::public.subscription_tier,
      plan_name = nullif(btrim(p_plan_name), ''), desks = p_desks, mrr_zar = p_mrr_zar,
      since = p_since, lease_signed_at = p_lease_signed_at, status = 'active'
    where id = v_tenant_id;
  end if;

  update public.leads set stage = 'won', sales_stage = 'Active Tenant' where id = p_lead_id;
  return v_tenant_id;
end;
$$;

revoke all on function public.is_sales_staff(uuid) from public;
grant execute on function public.is_sales_staff(uuid) to authenticated, service_role;
revoke all on function public.submit_website_tour_request(text, text, text, text) from public;
grant execute on function public.submit_website_tour_request(text, text, text, text) to anon, authenticated;
revoke all on function public.submit_website_sales_lead(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_website_sales_lead(text, text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.schedule_website_tour(uuid, uuid, timestamptz) from public;
grant execute on function public.schedule_website_tour(uuid, uuid, timestamptz) to anon, authenticated;
revoke all on function public.create_public_one_off_booking(text, text, text, text, text, text, date, time, time, integer, text) from public;
grant execute on function public.create_public_one_off_booking(text, text, text, text, text, text, date, time, time, integer, text) to anon, authenticated;
revoke all on function public.update_one_off_booking_status(uuid, text) from public;
grant execute on function public.update_one_off_booking_status(uuid, text) to authenticated;
revoke all on function public.import_existing_tenant(text, text, text, text, integer, integer, date, date, text, text) from public;
grant execute on function public.import_existing_tenant(text, text, text, text, integer, integer, date, date, text, text) to authenticated;
revoke all on function public.import_existing_tenants(jsonb) from public;
grant execute on function public.import_existing_tenants(jsonb) to authenticated;
revoke all on function public.link_lead_to_organization(uuid, uuid) from public;
grant execute on function public.link_lead_to_organization(uuid, uuid) to authenticated;
revoke all on function public.activate_lead_as_tenant(uuid, uuid, text, text, integer, integer, date, date) from public;
grant execute on function public.activate_lead_as_tenant(uuid, uuid, text, text, integer, integer, date, date) to authenticated;

drop policy if exists leads_sales on public.leads;
create policy leads_sales on public.leads for all to authenticated
  using (owner_id = auth.uid() or public.is_sales_staff(auth.uid()))
  with check (owner_id = auth.uid() or public.is_sales_staff(auth.uid()));

drop policy if exists tenants_admin_write on public.tenants;
drop policy if exists tenants_auth_read on public.tenants;
revoke insert, update, delete on public.tenants from authenticated;
grant select on public.tenants to authenticated;
create policy tenants_auth_read on public.tenants for select to authenticated using (
  public.is_sales_staff(auth.uid())
  or (organization_id is not null and public.has_organization_role(auth.uid(), organization_id))
);

drop policy if exists companies_auth_read on public.companies;
create policy companies_auth_read on public.companies for select to authenticated
  using (public.is_sales_staff(auth.uid()));

drop policy if exists bookings_one_off_staff_read on public.bookings;
create policy bookings_one_off_staff_read on public.bookings for select to authenticated
  using (lead_id is not null and public.is_office_co_staff(auth.uid()));
