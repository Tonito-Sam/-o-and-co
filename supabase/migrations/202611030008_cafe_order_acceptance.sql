create or replace function public.advance_cafe_order_status(_order_id uuid, _next_status text)
returns public.cafe_orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.cafe_orders%rowtype;
begin
  select * into v_order
  from public.cafe_orders
  where id = _order_id
  for update;

  if not found then raise exception 'Café order not found.'; end if;
  if not public.can_manage_cafe_branch(auth.uid(), v_order.branch_id) then
    raise exception 'You cannot manage café orders for this branch.';
  end if;
  if not (
    (v_order.status = 'queued' and _next_status = 'accepted')
    or (v_order.status = 'accepted' and _next_status = 'preparing')
    or (v_order.status = 'preparing' and _next_status = 'ready')
    or (v_order.status = 'ready' and _next_status = 'collected')
  ) then
    raise exception 'Invalid café order status transition.';
  end if;

  update public.cafe_orders
  set status = _next_status
  where id = _order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.advance_cafe_order_status(uuid, text) from public;
grant execute on function public.advance_cafe_order_status(uuid, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.cafe_orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
