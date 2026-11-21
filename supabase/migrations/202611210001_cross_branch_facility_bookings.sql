alter table public.facility_spaces
  add column if not exists is_bookable boolean not null default false;

update public.facility_spaces
set is_bookable = true
where category = 'meeting_room' and status = 'shared';

create table if not exists public.facility_booking_settings (
  id smallint primary key default 1 check (id = 1),
  included_hours_monthly numeric(5,2) not null default 3 check (included_hours_monthly >= 0),
  overage_hourly_zar integer not null default 450 check (overage_hourly_zar >= 0),
  updated_at timestamptz not null default now()
);

insert into public.facility_booking_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.facility_booking_settings enable row level security;
drop policy if exists facility_booking_settings_read on public.facility_booking_settings;
create policy facility_booking_settings_read on public.facility_booking_settings
  for select to authenticated using (true);
drop policy if exists facility_booking_settings_manage on public.facility_booking_settings;
create policy facility_booking_settings_manage on public.facility_booking_settings
  for update to authenticated
  using (public.is_global_tenant_staff(auth.uid()))
  with check (public.is_global_tenant_staff(auth.uid()));
grant select, update on public.facility_booking_settings to authenticated;

drop policy if exists facility_spaces_bookable_read on public.facility_spaces;
create policy facility_spaces_bookable_read on public.facility_spaces
  for select to authenticated
  using (
    is_bookable and status = 'shared'
    and exists (select 1 from public.branches b where b.id = branch_id and b.status = 'live')
  );

alter table public.branch_resource_bookings
  add column if not exists facility_space_id uuid references public.facility_spaces(id) on delete restrict,
  add column if not exists included_hours_applied numeric(6,2) not null default 0,
  add column if not exists overage_amount_zar integer not null default 0,
  add column if not exists event_quote_amount_zar integer;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.branch_resource_bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.branch_resource_bookings drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.branch_resource_bookings
  add constraint branch_resource_bookings_status_check
  check (status in ('requested', 'quoted', 'confirmed', 'cancelled', 'completed', 'declined'));

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.branch_resource_bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop
    execute format('alter table public.branch_resource_bookings drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.branch_resource_bookings
  add constraint branch_resource_bookings_resource_check
  check (num_nonnulls(office_id, desk_id, parking_space_id, equipment_id, facility_space_id) = 1);
create index if not exists idx_facility_bookings_space_time
  on public.branch_resource_bookings(facility_space_id, starts_at, ends_at)
  where facility_space_id is not null and status in ('requested', 'quoted', 'confirmed');

create or replace function public.guard_facility_space_booking_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if (old.facility_space_id is not null or new.facility_space_id is not null)
  then
    if current_setting('app.facility_booking_workflow', true) is distinct from 'on' then
      raise exception 'Facility bookings must be changed through the branch review workflow.';
    end if;
    if not public.can_manage_branch(auth.uid(), old.branch_id)
      and not (
        old.status = 'quoted'
        and new.status in ('confirmed', 'declined')
        and old.facility_space_id = new.facility_space_id
        and old.organization_id is not null
        and public.has_organization_role(auth.uid(), old.organization_id)
      )
    then
      raise exception 'You cannot change this facility booking.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_facility_space_booking_update on public.branch_resource_bookings;
create trigger trg_guard_facility_space_booking_update
before update on public.branch_resource_bookings
for each row execute function public.guard_facility_space_booking_update();

create or replace function public.validate_branch_resource_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resource_branch uuid;
begin
  if new.office_id is not null then
    select branch_id into v_resource_branch from public.branch_offices where id = new.office_id;
  elsif new.desk_id is not null then
    select branch_id into v_resource_branch from public.branch_desks where id = new.desk_id;
  elsif new.parking_space_id is not null then
    select branch_id into v_resource_branch from public.branch_parking_spaces where id = new.parking_space_id;
  elsif new.equipment_id is not null then
    select branch_id into v_resource_branch from public.branch_equipment where id = new.equipment_id;
  elsif new.facility_space_id is not null then
    select branch_id into v_resource_branch
    from public.facility_spaces
    where id = new.facility_space_id and is_bookable and status = 'shared';
    if tg_op = 'INSERT' then
      if new.status <> 'requested' then
        raise exception 'Facility bookings must be submitted as requests.';
      end if;
      if new.starts_at <= now() or new.ends_at - new.starts_at > interval '12 hours' then
        raise exception 'Choose a valid future booking time of up to 12 hours.';
      end if;
      if new.quantity < 1 or new.quantity > 100 then
        raise exception 'Choose a guest count between 1 and 100.';
      end if;
      if not exists (
        select 1 from public.branches
        where id = new.branch_id and status = 'live'
      ) then
        raise exception 'Select an active Office & Co branch.';
      end if;
      if date_trunc('month', new.starts_at at time zone 'Africa/Johannesburg')
          is distinct from date_trunc('month', (new.ends_at - interval '1 microsecond') at time zone 'Africa/Johannesburg') then
        raise exception 'Bookings must finish within the same calendar month.';
      end if;
      perform 1 from public.facility_spaces
      where id = new.facility_space_id
      for update;
      if exists (
        select 1 from public.branch_resource_bookings booking
        where booking.facility_space_id = new.facility_space_id
            and booking.status in ('requested', 'quoted', 'confirmed')
          and booking.starts_at < new.ends_at and booking.ends_at > new.starts_at
      ) then
        raise exception 'That space is already requested or booked for the selected time.';
      end if;
    end if;
  end if;

  if v_resource_branch is distinct from new.branch_id then
    raise exception 'The selected resource is unavailable at this branch.';
  end if;
  if new.facility_space_id is null or tg_op = 'INSERT' then
    if new.organization_id is not null and not public.has_organization_role(auth.uid(), new.organization_id) then
      raise exception 'You are not a member of the selected organization.';
    end if;
    if new.tenant_id is not null and not public.is_office_co_staff(auth.uid()) then
      raise exception 'You cannot book resources for this tenant.';
    end if;
    if new.organization_id is null and new.tenant_id is null and not public.is_office_co_staff(auth.uid()) then
      raise exception 'A customer organization is required to book this resource.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.request_facility_space_booking(
  p_branch_id uuid,
  p_space_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_guests integer default 1,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_space_name text;
  v_space_category text;
  v_space_branch uuid;
  v_booking_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before booking.'; end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at <= now() or p_ends_at <= p_starts_at then
    raise exception 'Choose a valid future booking time.';
  end if;
  if date_trunc('month', p_starts_at at time zone 'Africa/Johannesburg')
      is distinct from date_trunc('month', (p_ends_at - interval '1 microsecond') at time zone 'Africa/Johannesburg') then
    raise exception 'Bookings must finish within the same calendar month.';
  end if;
  if p_ends_at - p_starts_at > interval '12 hours' then
    raise exception 'A room booking cannot exceed 12 hours.';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 100 then
    raise exception 'Choose a guest count between 1 and 100.';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception 'Booking notes are too long.'; end if;

  select organization_id into v_organization_id
  from public.organization_members
  where user_id = v_user_id and status = 'active';
  if v_organization_id is null then raise exception 'An active organization membership is required.'; end if;

  select branch_id, name, category into v_space_branch, v_space_name, v_space_category
  from public.facility_spaces
  where id = p_space_id and is_bookable and status = 'shared'
  for update;
  if not found or v_space_branch is distinct from p_branch_id then
    raise exception 'That room is not available for booking.';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Select an active Office & Co branch.';
  end if;
  if exists (
    select 1 from public.branch_resource_bookings
    where facility_space_id = p_space_id and status in ('requested', 'quoted', 'confirmed')
      and starts_at < p_ends_at and ends_at > p_starts_at
  ) then
    raise exception 'That space is already requested or booked for the selected time.';
  end if;

  insert into public.branch_resource_bookings (
    branch_id, facility_space_id, organization_id, booked_by,
    starts_at, ends_at, quantity, status, notes
  )
  values (
    p_branch_id, p_space_id, v_organization_id, v_user_id,
    p_starts_at, p_ends_at, p_guests, 'requested', nullif(btrim(p_notes), '')
  )
  returning id into v_booking_id;

  return jsonb_build_object(
    'resource_booking_id', v_booking_id,
    'space_name', v_space_name,
    'space_category', v_space_category,
    'status', 'requested'
  );
end;
$$;

revoke all on function public.request_facility_space_booking(uuid, uuid, timestamptz, timestamptz, integer, text) from public;
grant execute on function public.request_facility_space_booking(uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;

create or replace function public.get_facility_space_availability(
  p_space_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'An active organization membership is required.';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days' then
    raise exception 'Choose an availability window of up to 7 days.';
  end if;
  if not exists (
    select 1 from public.facility_spaces
    where id = p_space_id and is_bookable and status = 'shared'
  ) then
    raise exception 'That room is not available for booking.';
  end if;

  return query
  select booking.starts_at, booking.ends_at, booking.status
  from public.branch_resource_bookings booking
  where booking.facility_space_id = p_space_id
    and booking.status in ('requested', 'quoted', 'confirmed')
    and booking.starts_at < p_to and booking.ends_at > p_from
  order by booking.starts_at;
end;
$$;

revoke all on function public.get_facility_space_availability(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_facility_space_availability(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.review_facility_space_booking(
  p_booking_id uuid,
  p_decision text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking public.branch_resource_bookings%rowtype;
  v_space_category text;
  v_allowance numeric(5,2);
  v_rate integer;
  v_used_hours numeric(8,2);
  v_booking_hours numeric(8,2);
  v_included_hours numeric(8,2);
  v_overage_amount integer;
  v_invoice_reference text;
  v_invoice_id uuid;
  v_month_start timestamptz;
  v_next_month timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in before reviewing bookings.'; end if;
  if p_decision is null or p_decision not in ('approve', 'decline') then
    raise exception 'Choose approve or decline.';
  end if;

  select * into v_booking
  from public.branch_resource_bookings
  where id = p_booking_id and facility_space_id is not null
  for update;
  if not found then raise exception 'Facility booking not found.'; end if;
  if not public.can_manage_branch(auth.uid(), v_booking.branch_id) then
    raise exception 'You cannot review bookings for this branch.';
  end if;
  if v_booking.status <> 'requested' then raise exception 'This booking has already been reviewed.'; end if;
  select category into v_space_category
  from public.facility_spaces
  where id = v_booking.facility_space_id;

  if p_decision = 'decline' then
    perform set_config('app.facility_booking_workflow', 'on', true);
    update public.branch_resource_bookings set status = 'declined', updated_at = now()
    where id = p_booking_id;
    return jsonb_build_object('status', 'declined', 'overage_amount_zar', 0);
  end if;
  if v_space_category <> 'meeting_room' then
    raise exception 'Event spaces require a separate quote.';
  end if;

  perform 1 from public.organizations where id = v_booking.organization_id for update;
  select included_hours_monthly, overage_hourly_zar
    into v_allowance, v_rate
  from public.facility_booking_settings where id = 1;

  v_month_start := date_trunc('month', v_booking.starts_at at time zone 'Africa/Johannesburg')
    at time zone 'Africa/Johannesburg';
  v_next_month := v_month_start + interval '1 month';
  if v_booking.ends_at > v_next_month then
    raise exception 'Bookings must finish within the same calendar month.';
  end if;

  select coalesce(sum(extract(epoch from (booking.ends_at - booking.starts_at)) / 3600), 0)
    into v_used_hours
  from public.branch_resource_bookings booking
  join public.facility_spaces space on space.id = booking.facility_space_id
  where booking.organization_id = v_booking.organization_id
    and space.category = 'meeting_room'
    and booking.status = 'confirmed'
    and booking.starts_at >= v_month_start and booking.starts_at < v_next_month;

  v_booking_hours := extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 3600;
  v_included_hours := least(v_booking_hours, greatest(v_allowance - v_used_hours, 0));
  v_overage_amount := ceil(greatest(v_booking_hours - v_included_hours, 0))::integer * v_rate;

  perform set_config('app.facility_booking_workflow', 'on', true);
  update public.branch_resource_bookings
  set status = 'confirmed',
      included_hours_applied = v_included_hours,
      overage_amount_zar = v_overage_amount,
      updated_at = now()
  where id = p_booking_id;

  if v_overage_amount > 0 then
    v_invoice_id := gen_random_uuid();
    v_invoice_reference := 'ROOM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.invoices (
      id, reference, organization_id, resource_booking_id, amount_zar, status, issued_at, due_at, metadata
    )
    values (
      v_invoice_id, v_invoice_reference, v_booking.organization_id, p_booking_id,
      v_overage_amount, 'sent', current_date, current_date + 7,
      jsonb_build_object(
        'kind', 'facility_room_overage',
        'included_hours', v_included_hours,
        'overage_hours', greatest(v_booking_hours - v_included_hours, 0),
        'hourly_rate_zar', v_rate
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'confirmed',
    'included_hours', v_included_hours,
    'overage_amount_zar', v_overage_amount,
    'invoice_reference', v_invoice_reference
  );
end;
$$;

revoke all on function public.review_facility_space_booking(uuid, text) from public;
grant execute on function public.review_facility_space_booking(uuid, text) to authenticated;

create or replace function public.quote_facility_event_booking(
  p_booking_id uuid,
  p_amount_zar integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking public.branch_resource_bookings%rowtype;
  v_category text;
begin
  if auth.uid() is null then raise exception 'Sign in before quoting an event booking.'; end if;
  if p_amount_zar is null or p_amount_zar < 0 or p_amount_zar > 10000000 then
    raise exception 'Enter an event-space quote between R0 and R10,000,000.';
  end if;
  select * into v_booking
  from public.branch_resource_bookings
  where id = p_booking_id and facility_space_id is not null
  for update;
  if not found then raise exception 'Event-space booking not found.'; end if;
  if not public.can_manage_branch(auth.uid(), v_booking.branch_id) then
    raise exception 'You cannot quote bookings for this branch.';
  end if;
  if v_booking.status <> 'requested' then raise exception 'This booking has already been reviewed.'; end if;
  select category into v_category
  from public.facility_spaces
  where id = v_booking.facility_space_id and is_bookable and status = 'shared';
  if v_category is null or v_category = 'meeting_room' then
    raise exception 'Only event spaces can use the separate quote workflow.';
  end if;

  perform set_config('app.facility_booking_workflow', 'on', true);
  update public.branch_resource_bookings
  set status = 'quoted',
      event_quote_amount_zar = p_amount_zar,
      updated_at = now()
  where id = p_booking_id;
  return jsonb_build_object('status', 'quoted', 'quote_amount_zar', p_amount_zar);
end;
$$;

revoke all on function public.quote_facility_event_booking(uuid, integer) from public;
grant execute on function public.quote_facility_event_booking(uuid, integer) to authenticated;

create or replace function public.respond_to_facility_event_quote(
  p_booking_id uuid,
  p_accept boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking public.branch_resource_bookings%rowtype;
  v_invoice_reference text;
  v_invoice_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before responding to an event quote.'; end if;
  if p_accept is null then raise exception 'Choose whether to accept the quote.'; end if;
  select * into v_booking
  from public.branch_resource_bookings
  where id = p_booking_id and facility_space_id is not null
  for update;
  if not found then raise exception 'Event-space booking not found.'; end if;
  if v_booking.status <> 'quoted' then raise exception 'This event quote is no longer awaiting a response.'; end if;
  if not public.has_organization_role(auth.uid(), v_booking.organization_id) then
    raise exception 'You cannot respond to this organization booking.';
  end if;

  if not p_accept then
    perform set_config('app.facility_booking_workflow', 'on', true);
    update public.branch_resource_bookings set status = 'declined', updated_at = now()
    where id = p_booking_id;
    return jsonb_build_object('status', 'declined');
  end if;

  perform set_config('app.facility_booking_workflow', 'on', true);
  update public.branch_resource_bookings
  set status = 'confirmed', updated_at = now()
  where id = p_booking_id;
  if v_booking.event_quote_amount_zar > 0 then
    v_invoice_id := gen_random_uuid();
    v_invoice_reference := 'EVENT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.invoices (
      id, reference, organization_id, resource_booking_id, amount_zar, status, issued_at, due_at, metadata
    )
    values (
      v_invoice_id, v_invoice_reference, v_booking.organization_id, p_booking_id,
      v_booking.event_quote_amount_zar, 'sent', current_date, current_date + 7,
      jsonb_build_object('kind', 'facility_event_quote', 'quote_amount_zar', v_booking.event_quote_amount_zar)
    );
  end if;
  return jsonb_build_object(
    'status', 'confirmed',
    'invoice_reference', v_invoice_reference,
    'quote_amount_zar', v_booking.event_quote_amount_zar
  );
end;
$$;

revoke all on function public.respond_to_facility_event_quote(uuid, boolean) from public;
grant execute on function public.respond_to_facility_event_quote(uuid, boolean) to authenticated;
