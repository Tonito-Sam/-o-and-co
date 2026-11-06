alter table public.cafe_orders
  add column if not exists payment_reference text,
  add column if not exists payment_authorization_url text,
  add column if not exists checkout_request_id uuid,
  add column if not exists paid_at timestamptz;

create unique index if not exists idx_cafe_orders_payment_reference
  on public.cafe_orders(payment_reference)
  where payment_reference is not null;
create unique index if not exists idx_cafe_orders_checkout_request
  on public.cafe_orders(profile_id, checkout_request_id)
  where checkout_request_id is not null;

drop policy if exists cafe_orders_insert on public.cafe_orders;
drop policy if exists cafe_orders_update_payment on public.cafe_orders;
revoke insert, update on public.cafe_orders from authenticated;
grant select on public.cafe_orders to authenticated;

create or replace function public.create_cafe_order(
  p_branch_id uuid,
  p_items jsonb,
  p_method text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch_name text;
  v_organization_id uuid;
  v_organization_name text;
  v_purchaser_name text;
  v_item jsonb;
  v_product public.cafe_products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_summary text := '';
  v_order public.cafe_orders%rowtype;
  v_invoice_id uuid;
  v_invoice_reference text;
  v_due_date date;
begin
  if v_user_id is null then
    raise exception 'Sign in before placing a café order.';
  end if;
  if p_request_id is null then
    raise exception 'A checkout request id is required.';
  end if;

  select * into v_order
  from public.cafe_orders
  where profile_id = v_user_id and checkout_request_id = p_request_id;
  if found then
    if v_order.branch_id is distinct from p_branch_id or v_order.method is distinct from p_method then
      raise exception 'Checkout request id was already used for a different order.';
    end if;
    select name into v_branch_name from public.branches where id = v_order.branch_id;
    select reference into v_invoice_reference from public.invoices where id::text = v_order.invoice_id;
    return jsonb_build_object(
      'order_id', v_order.id,
      'branch_id', v_order.branch_id,
      'branch_name', v_branch_name,
      'invoice_id', nullif(v_order.invoice_id, '')::uuid,
      'invoice_reference', v_invoice_reference,
      'organization_name', v_order.organization_name,
      'purchaser_name', v_order.purchaser_name,
      'items', v_order.items,
      'amount_zar', v_order.amount_zar,
      'method', v_order.method,
      'payment_status', v_order.payment_status,
      'due_date', v_order.due_date,
      'created_at', v_order.created_at
    );
  end if;

  if p_method is null or p_method not in ('Charge to account', 'Cash on Delivery', 'Paystack') then
    raise exception 'Choose an available payment method.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Choose between 1 and 30 café items.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    group by entry.value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Each café product can appear only once in the cart.';
  end if;

  select name into v_branch_name
  from public.branches
  where id = p_branch_id and status = 'live';
  if not found then
    raise exception 'Choose an active café branch.';
  end if;

  select om.organization_id, o.name
  into v_organization_id, v_organization_name
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = v_user_id
    and om.branch_id = p_branch_id
    and om.status = 'active';
  if p_method = 'Charge to account' and v_organization_id is null then
    raise exception 'Charge to account is available only to active tenant members at this branch.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email)
  into v_purchaser_name
  from public.profiles
  where id = v_user_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'One or more café cart items are invalid.';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product
    from public.cafe_products
    where id = v_product_id
    for update;

    if not found or not v_product.is_active or not v_product.is_available or v_product.branch_id <> p_branch_id then
      raise exception 'A café item is no longer available at the selected branch.';
    end if;
    if v_product.track_inventory and v_product.stock_quantity < v_quantity then
      raise exception 'There is not enough stock for %.', v_product.name;
    end if;

    v_total := v_total + (v_product.price_zar::bigint * v_quantity);
    if v_total > 2147483647 then
      raise exception 'The café order total exceeds the supported amount.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'name', v_product.name,
      'qty', v_quantity,
      'price', v_product.price_zar,
      'image', v_product.image_url
    ));
    v_summary := concat_ws(', ', nullif(v_summary, ''), v_quantity || 'x ' || v_product.name);

    if v_product.track_inventory then
      update public.cafe_products
      set stock_quantity = stock_quantity - v_quantity,
          updated_by = v_user_id
      where id = v_product.id;
      insert into public.cafe_stock_movements (
        product_id, branch_id, quantity_change, reason, note, actor_id
      ) values (
        v_product.id, p_branch_id, -v_quantity, 'sale', 'Café order', v_user_id
      );
    end if;
  end loop;

  if p_method = 'Charge to account' then
    v_invoice_id := gen_random_uuid();
    v_invoice_reference := 'CAFE-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_due_date := current_date + 7;
    insert into public.invoices (
      id, reference, organization_id, amount_zar, status, issued_at, due_at, metadata
    ) values (
      v_invoice_id, v_invoice_reference, v_organization_id, v_total::integer, 'sent',
      current_date, v_due_date,
      jsonb_build_object(
        'kind', 'cafe',
        'branch_id', p_branch_id,
        'purchaser_id', v_user_id,
        'purchaser_name', v_purchaser_name,
        'items', v_items
      )
    );
  end if;

  insert into public.cafe_orders (
    branch_id, profile_id, item, amount_zar, method, status, invoice_id,
    organization_id, organization_name, purchaser_name, items, payment_status, due_date,
    checkout_request_id
  ) values (
    p_branch_id, v_user_id, v_summary, v_total::integer, p_method,
    case when p_method = 'Paystack' then 'awaiting_payment' else 'queued' end,
    v_invoice_id::text, v_organization_id, coalesce(v_organization_name, 'Workspace member'),
    v_purchaser_name, v_items,
    case when p_method = 'Paystack' then 'Pending verification'
      when v_invoice_id is null then 'Unpaid' else 'Sent' end,
    v_due_date, p_request_id
  ) returning * into v_order;

  if v_invoice_id is not null then
    update public.invoices
    set metadata = metadata || jsonb_build_object('cafe_order_id', v_order.id)
    where id = v_invoice_id;
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (
    v_user_id, 'cafe_order', v_order.id, 'created',
    jsonb_build_object('branch_id', p_branch_id, 'amount_zar', v_total, 'method', p_method)
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'branch_id', v_order.branch_id,
    'branch_name', v_branch_name,
    'invoice_id', v_invoice_id,
    'invoice_reference', v_invoice_reference,
    'organization_name', v_order.organization_name,
    'purchaser_name', v_order.purchaser_name,
    'items', v_order.items,
    'amount_zar', v_order.amount_zar,
    'method', v_order.method,
    'payment_status', v_order.payment_status,
    'due_date', v_order.due_date,
    'created_at', v_order.created_at
  );
end;
$$;

revoke all on function public.create_cafe_order(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.create_cafe_order(uuid, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';

create or replace function public.notify_cafe_managers_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_branch_name text;
  v_order_number text := upper(left(replace(new.id::text, '-', ''), 8));
begin
  if tg_op = 'UPDATE' then
    if old.status = 'queued' or new.status <> 'queued' then return new; end if;
  elsif new.status <> 'queued' then
    return new;
  end if;
  if new.branch_id is null then return new; end if;

  select name into v_branch_name
  from public.branches
  where id = new.branch_id;

  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id,
    'New café order · ' || coalesce(v_branch_name, 'Branch'),
    'Order #' || v_order_number || ' · ' || coalesce(new.purchaser_name, 'Customer')
      || ' · ' || left(new.item, 220) || ' · R' || to_char(coalesce(new.amount_zar, 0), 'FM999G999G990'),
    '/cafe?view=kitchen'
  from public.user_roles assigned
  where assigned.role::text = 'cafe_manager'
    and assigned.branch_id = new.branch_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_cafe_managers_new_order on public.cafe_orders;
create trigger trg_notify_cafe_managers_new_order
after insert or update of status on public.cafe_orders
for each row execute function public.notify_cafe_managers_new_order();

revoke all on function public.notify_cafe_managers_new_order() from public, anon, authenticated;