alter table public.cafe_orders
  add column if not exists invoice_id text,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists organization_name text,
  add column if not exists purchaser_name text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists payment_status text not null default 'Unpaid',
  add column if not exists due_date date;

create unique index if not exists idx_cafe_orders_invoice_id
  on public.cafe_orders(invoice_id)
  where invoice_id is not null;

create index if not exists idx_cafe_orders_profile_created
  on public.cafe_orders(profile_id, created_at desc);

drop policy if exists cafe_self on public.cafe_orders;
drop policy if exists cafe_orders_read on public.cafe_orders;
drop policy if exists cafe_orders_insert on public.cafe_orders;
drop policy if exists cafe_orders_update_payment on public.cafe_orders;

create policy cafe_orders_read on public.cafe_orders for select to authenticated
  using (
    profile_id = auth.uid()
    or public.can_manage_cafe_branch(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'finance')
    or exists (
      select 1 from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = cafe_orders.organization_id
        and om.role = 'admin'
        and om.status = 'active'
    )
  );

create policy cafe_orders_insert on public.cafe_orders for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.cafe_products cp
      where cp.branch_id = cafe_orders.branch_id
        and cp.is_active
    )
  );

create policy cafe_orders_update_payment on public.cafe_orders for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke update on public.cafe_orders from authenticated;
grant select, insert on public.cafe_orders to authenticated;
grant update (payment_status) on public.cafe_orders to authenticated;
grant all on public.cafe_orders to service_role;
