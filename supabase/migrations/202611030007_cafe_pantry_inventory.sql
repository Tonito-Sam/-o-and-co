create table if not exists public.cafe_pantry_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  category text not null default 'Ingredients',
  unit text not null default 'unit',
  quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
  reorder_quantity numeric(12,2) not null default 1 check (reorder_quantity > 0),
  vendor text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create index if not exists idx_cafe_pantry_items_branch_active
  on public.cafe_pantry_items(branch_id, is_active, name);

create table if not exists public.cafe_restock_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cafe_pantry_items(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  note text,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'ordered', 'received', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_cafe_restock_requests_branch_status
  on public.cafe_restock_requests(branch_id, status, created_at desc);

alter table public.cafe_pantry_items enable row level security;
alter table public.cafe_restock_requests enable row level security;

grant select, insert, update on public.cafe_pantry_items to authenticated;
grant select, insert, update on public.cafe_restock_requests to authenticated;
grant all on public.cafe_pantry_items, public.cafe_restock_requests to service_role;

drop policy if exists cafe_pantry_items_branch_manage on public.cafe_pantry_items;
create policy cafe_pantry_items_branch_manage on public.cafe_pantry_items
  for all to authenticated
  using (public.can_manage_cafe_branch(auth.uid(), branch_id))
  with check (public.can_manage_cafe_branch(auth.uid(), branch_id));

drop policy if exists cafe_restock_requests_branch_read on public.cafe_restock_requests;
create policy cafe_restock_requests_branch_read on public.cafe_restock_requests
  for select to authenticated
  using (public.can_manage_cafe_branch(auth.uid(), branch_id));

drop policy if exists cafe_restock_requests_branch_create on public.cafe_restock_requests;
create policy cafe_restock_requests_branch_create on public.cafe_restock_requests
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and public.can_manage_cafe_branch(auth.uid(), branch_id)
    and exists (
      select 1 from public.cafe_pantry_items item
      where item.id = cafe_restock_requests.item_id
        and item.branch_id = cafe_restock_requests.branch_id
        and item.is_active
    )
  );

drop policy if exists cafe_restock_requests_manager_update on public.cafe_restock_requests;
create policy cafe_restock_requests_manager_update on public.cafe_restock_requests
  for update to authenticated
  using (
    public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'group_ceo')
  )
  with check (
    public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'group_ceo')
  );

create or replace function public.touch_cafe_pantry_item_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_cafe_pantry_item_touch on public.cafe_pantry_items;
create trigger trg_cafe_pantry_item_touch before update on public.cafe_pantry_items
  for each row execute function public.touch_cafe_pantry_item_updated_at();

create or replace function public.notify_cafe_restock_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item public.cafe_pantry_items%rowtype;
  v_branch_name text;
begin
  select * into v_item from public.cafe_pantry_items where id = new.item_id;
  select name into v_branch_name from public.branches where id = new.branch_id;

  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id,
    'Pantry restock requested · ' || coalesce(v_branch_name, 'Branch'),
    v_item.name || ' · ' || trim(trailing '.' from to_char(new.quantity, 'FM999999999990.99')) || ' ' || v_item.unit,
    '/cafe'
  from public.user_roles assigned
  where assigned.role::text = 'branch_manager'
    and assigned.branch_id = new.branch_id
    and assigned.user_id is distinct from new.requested_by;

  return new;
end;
$$;

create or replace function public.notify_cafe_restock_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item_name text;
begin
  if old.status is not distinct from new.status then return new; end if;
  select name into v_item_name from public.cafe_pantry_items where id = new.item_id;

  if new.requested_by is not null then
    insert into public.notifications(profile_id, title, body, url)
    values (
      new.requested_by,
      'Pantry restock ' || new.status,
      coalesce(v_item_name, 'Pantry item') || ' · request status: ' || new.status,
      '/cafe'
    );
  end if;

  return new;
end;
$$;

create or replace function public.apply_cafe_restock_received()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'received' and old.status is distinct from 'received' then
    update public.cafe_pantry_items
    set quantity_on_hand = quantity_on_hand + new.quantity
    where id = new.item_id and branch_id = new.branch_id;
  end if;
  return new;
end;
$$;

revoke all on function public.touch_cafe_pantry_item_updated_at() from public, anon, authenticated;
revoke all on function public.notify_cafe_restock_request() from public, anon, authenticated;
revoke all on function public.notify_cafe_restock_status() from public, anon, authenticated;
revoke all on function public.apply_cafe_restock_received() from public, anon, authenticated;

drop trigger if exists trg_notify_cafe_restock_request on public.cafe_restock_requests;
create trigger trg_notify_cafe_restock_request after insert on public.cafe_restock_requests
  for each row execute function public.notify_cafe_restock_request();

drop trigger if exists trg_notify_cafe_restock_status on public.cafe_restock_requests;
create trigger trg_notify_cafe_restock_status after update of status on public.cafe_restock_requests
  for each row execute function public.notify_cafe_restock_status();

drop trigger if exists trg_apply_cafe_restock_received on public.cafe_restock_requests;
create trigger trg_apply_cafe_restock_received after update of status on public.cafe_restock_requests
  for each row execute function public.apply_cafe_restock_received();
