create table if not exists public.branch_sections (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  section_key text not null check (section_key in ('rooms','desks','offices','parking','equipment','feed','events','shop','support')),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, section_key)
);

create table if not exists public.branch_offices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  floor integer,
  capacity integer not null default 1 check (capacity > 0),
  monthly_zar integer not null default 0 check (monthly_zar >= 0),
  status text not null default 'available' check (status in ('available','held','occupied','maintenance','inactive')),
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table if not exists public.branch_desks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  floor integer,
  desk_type text not null default 'dedicated' check (desk_type in ('hot_desk','dedicated','team_desk')),
  monthly_zar integer not null default 0 check (monthly_zar >= 0),
  status text not null default 'available' check (status in ('available','held','occupied','maintenance','inactive')),
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table if not exists public.branch_parking_spaces (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  parking_type text not null default 'standard' check (parking_type in ('standard','covered','reserved','accessible','visitor','ev')),
  monthly_zar integer not null default 0 check (monthly_zar >= 0),
  status text not null default 'available' check (status in ('available','held','occupied','maintenance','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table if not exists public.branch_equipment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  name text not null,
  category text not null default 'general',
  description text,
  quantity integer not null default 1 check (quantity >= 0),
  available_quantity integer not null default 1 check (available_quantity >= 0 and available_quantity <= quantity),
  hourly_zar integer not null default 0 check (hourly_zar >= 0),
  image_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_branch_equipment_name on public.branch_equipment(branch_id, lower(name));

create table if not exists public.branch_resource_bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  office_id uuid references public.branch_offices(id) on delete restrict,
  desk_id uuid references public.branch_desks(id) on delete restrict,
  parking_space_id uuid references public.branch_parking_spaces(id) on delete restrict,
  equipment_id uuid references public.branch_equipment(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  booked_by uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed','declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (num_nonnulls(office_id, desk_id, parking_space_id, equipment_id) = 1)
);
create index if not exists idx_branch_resource_bookings_branch_time on public.branch_resource_bookings(branch_id, starts_at, ends_at);
create index if not exists idx_branch_resource_bookings_booker on public.branch_resource_bookings(booked_by, starts_at desc);

create or replace function public.validate_branch_resource_booking()
returns trigger language plpgsql set search_path = public as $$
declare
  v_resource_branch uuid;
begin
  if new.office_id is not null then select branch_id into v_resource_branch from public.branch_offices where id = new.office_id;
  elsif new.desk_id is not null then select branch_id into v_resource_branch from public.branch_desks where id = new.desk_id;
  elsif new.parking_space_id is not null then select branch_id into v_resource_branch from public.branch_parking_spaces where id = new.parking_space_id;
  elsif new.equipment_id is not null then select branch_id into v_resource_branch from public.branch_equipment where id = new.equipment_id;
  end if;
  if v_resource_branch is distinct from new.branch_id then
    raise exception 'The selected resource does not belong to this branch.';
  end if;
  if new.organization_id is not null and not public.has_organization_role(auth.uid(), new.organization_id) then
    raise exception 'You are not a member of the selected organization.';
  end if;
  if new.tenant_id is not null and not public.is_office_co_staff(auth.uid()) then
    raise exception 'You cannot book resources for this tenant.';
  end if;
  if new.organization_id is null and new.tenant_id is null and not public.is_office_co_staff(auth.uid()) then
    raise exception 'A customer organization is required to book this resource.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_branch_resource_booking on public.branch_resource_bookings;
create trigger trg_validate_branch_resource_booking
before insert or update on public.branch_resource_bookings
for each row execute function public.validate_branch_resource_booking();

create table if not exists public.branch_shop_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'general',
  price_zar integer not null default 0 check (price_zar >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  image_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_branch_shop_items_branch_active on public.branch_shop_items(branch_id, is_active, category);

create table if not exists public.branch_shop_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SHOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  branch_id uuid not null references public.branches(id),
  organization_id uuid references public.organizations(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  ordered_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'placed' check (status in ('placed','accepted','ready','collected','cancelled','refunded')),
  total_zar integer not null default 0 check (total_zar >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_branch_shop_orders_branch_status on public.branch_shop_orders(branch_id, status, created_at desc);
create index if not exists idx_branch_shop_orders_member on public.branch_shop_orders(ordered_by, created_at desc);

create table if not exists public.branch_shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.branch_shop_orders(id) on delete cascade,
  item_id uuid references public.branch_shop_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_zar integer not null check (unit_price_zar >= 0),
  line_total_zar integer generated always as (quantity * unit_price_zar) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_branch_shop_order_items_order on public.branch_shop_order_items(order_id);

create or replace function public.touch_branch_inventory_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_branch_sections_touch on public.branch_sections;
create trigger trg_branch_sections_touch before update on public.branch_sections for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_offices_touch on public.branch_offices;
create trigger trg_branch_offices_touch before update on public.branch_offices for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_desks_touch on public.branch_desks;
create trigger trg_branch_desks_touch before update on public.branch_desks for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_parking_touch on public.branch_parking_spaces;
create trigger trg_branch_parking_touch before update on public.branch_parking_spaces for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_equipment_touch on public.branch_equipment;
create trigger trg_branch_equipment_touch before update on public.branch_equipment for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_shop_items_touch on public.branch_shop_items;
create trigger trg_branch_shop_items_touch before update on public.branch_shop_items for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_resource_bookings_touch on public.branch_resource_bookings;
create trigger trg_branch_resource_bookings_touch before update on public.branch_resource_bookings for each row execute function public.touch_branch_inventory_updated_at();
drop trigger if exists trg_branch_shop_orders_touch on public.branch_shop_orders;
create trigger trg_branch_shop_orders_touch before update on public.branch_shop_orders for each row execute function public.touch_branch_inventory_updated_at();

alter table public.branch_sections enable row level security;
alter table public.branch_offices enable row level security;
alter table public.branch_desks enable row level security;
alter table public.branch_parking_spaces enable row level security;
alter table public.branch_equipment enable row level security;
alter table public.branch_resource_bookings enable row level security;
alter table public.branch_shop_items enable row level security;
alter table public.branch_shop_orders enable row level security;
alter table public.branch_shop_order_items enable row level security;

create policy branch_sections_read on public.branch_sections for select to authenticated using (enabled);
create policy branch_sections_manage on public.branch_sections for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));

create policy branch_offices_read on public.branch_offices for select to authenticated using (status <> 'inactive');
create policy branch_offices_manage on public.branch_offices for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_desks_read on public.branch_desks for select to authenticated using (status <> 'inactive');
create policy branch_desks_manage on public.branch_desks for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_parking_read on public.branch_parking_spaces for select to authenticated using (status <> 'inactive');
create policy branch_parking_manage on public.branch_parking_spaces for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_equipment_read on public.branch_equipment for select to authenticated using (is_active);
create policy branch_equipment_manage on public.branch_equipment for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));

create policy branch_resource_bookings_read on public.branch_resource_bookings for select to authenticated
  using (booked_by = auth.uid() or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_resource_bookings_create on public.branch_resource_bookings for insert to authenticated
  with check (
    booked_by = auth.uid()
    and (public.is_office_co_staff(auth.uid())
      or (organization_id is not null and public.has_organization_role(auth.uid(), organization_id)))
  );
create policy branch_resource_bookings_update on public.branch_resource_bookings for update to authenticated
  using (booked_by = auth.uid() or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (booked_by = auth.uid() or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));

create policy branch_shop_items_read on public.branch_shop_items for select to authenticated using (is_active);
create policy branch_shop_items_manage on public.branch_shop_items for all to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_shop_orders_read on public.branch_shop_orders for select to authenticated
  using (ordered_by = auth.uid() or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_shop_orders_create on public.branch_shop_orders for insert to authenticated
  with check (
    ordered_by = auth.uid()
    and (public.is_office_co_staff(auth.uid())
      or (organization_id is not null and public.has_organization_role(auth.uid(), organization_id)))
  );
create policy branch_shop_orders_manage on public.branch_shop_orders for update to authenticated
  using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'));
create policy branch_shop_order_items_read on public.branch_shop_order_items for select to authenticated
  using (exists (select 1 from public.branch_shop_orders o where o.id = order_id and (o.ordered_by = auth.uid() or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo'))));
create policy branch_shop_order_items_create on public.branch_shop_order_items for insert to authenticated
  with check (exists (select 1 from public.branch_shop_orders o where o.id = order_id and o.ordered_by = auth.uid() and o.status = 'placed'));

grant select, insert, update, delete on public.branch_sections, public.branch_offices, public.branch_desks,
  public.branch_parking_spaces, public.branch_equipment, public.branch_shop_items to authenticated;
grant select, insert, update on public.branch_resource_bookings, public.branch_shop_orders,
  public.branch_shop_order_items to authenticated;
revoke delete on public.branch_resource_bookings, public.branch_shop_orders, public.branch_shop_order_items from authenticated;
revoke update on public.branch_shop_order_items from authenticated;
grant all on public.branch_sections, public.branch_offices, public.branch_desks, public.branch_parking_spaces,
  public.branch_equipment, public.branch_resource_bookings, public.branch_shop_items,
  public.branch_shop_orders, public.branch_shop_order_items to service_role;

insert into public.branch_sections (branch_id, section_key, sort_order)
select b.id, section.section_key, section.sort_order
from public.branches b
cross join (values
  ('rooms', 1), ('offices', 2), ('parking', 3), ('equipment', 4),
  ('feed', 5), ('events', 6), ('shop', 7), ('support', 8)
) as section(section_key, sort_order)
where b.slug = 'kyalami'
on conflict (branch_id, section_key) do update set enabled = true, sort_order = excluded.sort_order;

insert into public.branch_sections (branch_id, section_key, sort_order)
select b.id, section.section_key, section.sort_order
from public.branches b
cross join (values
  ('rooms', 1), ('desks', 2), ('offices', 3), ('equipment', 4),
  ('feed', 5), ('events', 6), ('shop', 7), ('support', 8)
) as section(section_key, sort_order)
where b.slug = 'rosebank'
on conflict (branch_id, section_key) do update set enabled = true, sort_order = excluded.sort_order;
