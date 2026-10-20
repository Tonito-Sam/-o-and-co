create table if not exists public.cafe_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  description text not null default '',
  price_zar integer not null default 0 check (price_zar >= 0),
  image_url text,
  vendor text,
  is_available boolean not null default true,
  is_popular boolean not null default false,
  is_active boolean not null default true,
  track_inventory boolean not null default true,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create index if not exists idx_cafe_products_branch_active
  on public.cafe_products(branch_id, is_active, category);

create table if not exists public.cafe_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.cafe_products(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete cascade,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (reason in ('restock','sale','waste','count_adjustment')),
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cafe_stock_movements_product
  on public.cafe_stock_movements(product_id, created_at desc);

create or replace function public.can_manage_cafe_branch(_user_id uuid, _branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'group_ceo') or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.branch_id = _branch_id
      and ur.role::text in ('cafe_manager', 'branch_manager')
  );
$$;

create or replace function public.touch_cafe_product_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cafe_products_touch on public.cafe_products;
create trigger trg_cafe_products_touch before update on public.cafe_products
  for each row execute function public.touch_cafe_product_updated_at();

alter table public.cafe_products enable row level security;
alter table public.cafe_stock_movements enable row level security;

drop policy if exists cafe_products_read on public.cafe_products;
drop policy if exists cafe_products_create on public.cafe_products;
drop policy if exists cafe_products_update on public.cafe_products;
drop policy if exists cafe_stock_movements_read on public.cafe_stock_movements;

create policy cafe_products_read on public.cafe_products for select to authenticated
  using (
    is_active and (
      public.can_manage_cafe_branch(auth.uid(), branch_id)
      or exists (
        select 1 from public.organization_members om
        where om.user_id = auth.uid()
          and om.branch_id = cafe_products.branch_id
          and om.status = 'active'
      )
    )
  );

create policy cafe_products_create on public.cafe_products for insert to authenticated
  with check (public.can_manage_cafe_branch(auth.uid(), branch_id));

create policy cafe_products_update on public.cafe_products for update to authenticated
  using (public.can_manage_cafe_branch(auth.uid(), branch_id))
  with check (public.can_manage_cafe_branch(auth.uid(), branch_id));

create policy cafe_stock_movements_read on public.cafe_stock_movements for select to authenticated
  using (public.can_manage_cafe_branch(auth.uid(), branch_id));

grant select, insert, update on public.cafe_products to authenticated;
grant select on public.cafe_stock_movements to authenticated;
grant all on public.cafe_products, public.cafe_stock_movements to service_role;

create or replace function public.adjust_cafe_stock(
  _product_id uuid,
  _quantity_change integer,
  _reason text,
  _note text default null
)
returns public.cafe_products
language plpgsql security definer set search_path = public as $$
declare
  v_product public.cafe_products%rowtype;
begin
  if _quantity_change = 0 or _reason not in ('restock','sale','waste','count_adjustment') then
    raise exception 'Invalid stock adjustment.';
  end if;

  select * into v_product
  from public.cafe_products
  where id = _product_id and is_active
  for update;

  if not found then raise exception 'Café product not found.'; end if;
  if not public.can_manage_cafe_branch(auth.uid(), v_product.branch_id) then
    raise exception 'You cannot manage café stock for this branch.';
  end if;
  if v_product.stock_quantity + _quantity_change < 0 then
    raise exception 'Stock cannot fall below zero.';
  end if;

  update public.cafe_products
  set stock_quantity = stock_quantity + _quantity_change,
      updated_by = auth.uid()
  where id = _product_id
  returning * into v_product;

  insert into public.cafe_stock_movements (
    product_id, branch_id, quantity_change, reason, note, actor_id
  ) values (
    v_product.id, v_product.branch_id, _quantity_change, _reason, nullif(trim(_note), ''), auth.uid()
  );

  return v_product;
end;
$$;

revoke all on function public.adjust_cafe_stock(uuid, integer, text, text) from public;
grant execute on function public.adjust_cafe_stock(uuid, integer, text, text) to authenticated;