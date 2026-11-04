create or replace function public.notify_cafe_managers_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_branch_name text;
  v_order_number text := upper(left(replace(new.id::text, '-', ''), 8));
begin
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

revoke all on function public.notify_cafe_managers_new_order() from public, anon, authenticated;

drop trigger if exists trg_notify_cafe_managers_new_order on public.cafe_orders;
create trigger trg_notify_cafe_managers_new_order
after insert on public.cafe_orders
for each row execute function public.notify_cafe_managers_new_order();
