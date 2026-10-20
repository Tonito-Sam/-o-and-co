drop policy if exists organization_branch_bookings_read on public.branch_resource_bookings;
create policy organization_branch_bookings_read on public.branch_resource_bookings for select to authenticated
  using (
    organization_id is not null
    and public.has_organization_role(auth.uid(), organization_id)
  );

drop policy if exists organization_branch_shop_orders_read on public.branch_shop_orders;
create policy organization_branch_shop_orders_read on public.branch_shop_orders for select to authenticated
  using (
    organization_id is not null
    and public.has_organization_role(auth.uid(), organization_id)
  );
