alter table public.invoices
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists resource_booking_id uuid references public.branch_resource_bookings(id) on delete set null;
create unique index if not exists idx_invoices_booking_unique on public.invoices(booking_id) where booking_id is not null;
create unique index if not exists idx_invoices_resource_booking_unique on public.invoices(resource_booking_id) where resource_booking_id is not null;

create or replace function public.request_organization_resource_booking(
  p_branch_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_quantity integer default 1,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_resource_branch uuid;
  v_resource_name text;
  v_hourly_rate integer := 0;
  v_monthly_rate integer := 0;
  v_status text;
  v_duration_hours integer;
  v_amount integer;
  v_booking_id uuid;
  v_resource_booking_id uuid;
  v_invoice_id uuid := gen_random_uuid();
  v_reference text := 'OCO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if v_user_id is null then raise exception 'Sign in before booking.'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'Choose a valid quantity.'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then raise exception 'Choose a valid booking time.'; end if;
  if p_ends_at <= now() then raise exception 'Booking time must be in the future.'; end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Select an active Office & Co branch.';
  end if;
  select organization_id into v_organization_id
  from public.organization_members
  where user_id = v_user_id and status = 'active';
  if v_organization_id is null then raise exception 'An active organization membership is required.'; end if;

  v_duration_hours := greatest(1, ceil(extract(epoch from (p_ends_at - p_starts_at)) / 3600)::integer);
  if v_duration_hours > 24 * 31 then raise exception 'Bookings cannot exceed 31 days.'; end if;

  if p_resource_type = 'room' then
    select branch_id, name, hourly_zar into v_resource_branch, v_resource_name, v_hourly_rate
    from public.rooms where id = p_resource_id and is_active for update;
    if not found then raise exception 'That room is unavailable.'; end if;
    if exists (
      select 1 from public.bookings
      where room_id = p_resource_id and status in ('held','confirmed')
        and starts_at < p_ends_at and ends_at > p_starts_at
    ) then raise exception 'That room is already booked for the selected time.'; end if;
    v_amount := v_hourly_rate * v_duration_hours * p_quantity;
    insert into public.bookings (room_id, booked_by, starts_at, ends_at, status, guests, notes)
    values (p_resource_id, v_user_id, p_starts_at, p_ends_at, 'held', p_quantity, p_notes)
    returning id into v_booking_id;
  elsif p_resource_type = 'equipment' then
    select branch_id, name, hourly_zar into v_resource_branch, v_resource_name, v_hourly_rate
    from public.branch_equipment where id = p_resource_id and is_active and available_quantity >= p_quantity for update;
    if not found then raise exception 'That equipment is unavailable.'; end if;
    if exists (
      select 1 from public.branch_resource_bookings
      where equipment_id = p_resource_id and status in ('requested','confirmed')
        and starts_at < p_ends_at and ends_at > p_starts_at
      group by equipment_id
      having coalesce(sum(quantity), 0) + p_quantity > (
        select available_quantity from public.branch_equipment where id = p_resource_id
      )
    ) then raise exception 'There is not enough equipment available for that time.'; end if;
    v_amount := v_hourly_rate * v_duration_hours * p_quantity;
    insert into public.branch_resource_bookings (branch_id, equipment_id, organization_id, booked_by, starts_at, ends_at, quantity, status, notes)
    values (p_branch_id, p_resource_id, v_organization_id, v_user_id, p_starts_at, p_ends_at, p_quantity, 'requested', p_notes)
    returning id into v_resource_booking_id;
  elsif p_resource_type in ('office','desk','parking') then
    if p_resource_type = 'office' then
      select branch_id, name, monthly_zar, status into v_resource_branch, v_resource_name, v_monthly_rate, v_status
      from public.branch_offices where id = p_resource_id for update;
    elsif p_resource_type = 'desk' then
      select branch_id, name, monthly_zar, status into v_resource_branch, v_resource_name, v_monthly_rate, v_status
      from public.branch_desks where id = p_resource_id for update;
    else
      select branch_id, name, monthly_zar, status into v_resource_branch, v_resource_name, v_monthly_rate, v_status
      from public.branch_parking_spaces where id = p_resource_id for update;
    end if;
    if not found or v_status <> 'available' then raise exception 'That resource is unavailable.'; end if;
    if p_ends_at - p_starts_at > interval '31 days' then raise exception 'Monthly resources can be requested for up to 31 days at a time.'; end if;
    if exists (
      select 1 from public.branch_resource_bookings
      where status in ('requested','confirmed')
        and starts_at < p_ends_at and ends_at > p_starts_at
        and ((p_resource_type = 'office' and office_id = p_resource_id)
          or (p_resource_type = 'desk' and desk_id = p_resource_id)
          or (p_resource_type = 'parking' and parking_space_id = p_resource_id))
    ) then raise exception 'That resource is already requested for the selected time.'; end if;
    v_amount := v_monthly_rate * p_quantity;
    if p_resource_type = 'office' then
      insert into public.branch_resource_bookings (branch_id, office_id, organization_id, booked_by, starts_at, ends_at, quantity, status, notes)
      values (p_branch_id, p_resource_id, v_organization_id, v_user_id, p_starts_at, p_ends_at, p_quantity, 'requested', p_notes)
      returning id into v_resource_booking_id;
    elsif p_resource_type = 'desk' then
      insert into public.branch_resource_bookings (branch_id, desk_id, organization_id, booked_by, starts_at, ends_at, quantity, status, notes)
      values (p_branch_id, p_resource_id, v_organization_id, v_user_id, p_starts_at, p_ends_at, p_quantity, 'requested', p_notes)
      returning id into v_resource_booking_id;
    else
      insert into public.branch_resource_bookings (branch_id, parking_space_id, organization_id, booked_by, starts_at, ends_at, quantity, status, notes)
      values (p_branch_id, p_resource_id, v_organization_id, v_user_id, p_starts_at, p_ends_at, p_quantity, 'requested', p_notes)
      returning id into v_resource_booking_id;
    end if;
  else
    raise exception 'Unsupported resource type.';
  end if;

  if v_resource_branch is distinct from p_branch_id then raise exception 'The selected resource is not at that branch.'; end if;
  if v_amount <= 0 then raise exception 'This resource has no billable rate configured. Contact the branch to request it.'; end if;

  insert into public.invoices (id, reference, organization_id, booking_id, resource_booking_id, amount_zar, status, issued_at, due_at, metadata)
  values (
    v_invoice_id,
    v_reference,
    v_organization_id,
    v_booking_id,
    v_resource_booking_id,
    v_amount,
    'sent',
    current_date,
    current_date + 7,
    jsonb_build_object('resource_name', v_resource_name, 'branch_id', p_branch_id, 'resource_type', p_resource_type, 'quantity', p_quantity)
  );

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'resource_booking_id', v_resource_booking_id,
    'invoice_id', v_invoice_id,
    'reference', v_reference,
    'amount_zar', v_amount,
    'resource_name', v_resource_name
  );
end;
$$;

revoke all on function public.request_organization_resource_booking(uuid, text, uuid, timestamptz, timestamptz, integer, text) from public;
grant execute on function public.request_organization_resource_booking(uuid, text, uuid, timestamptz, timestamptz, integer, text) to authenticated;
