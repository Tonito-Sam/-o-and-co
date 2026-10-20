alter table public.profiles
  add column if not exists work_branch_id uuid references public.branches(id) on delete set null;

drop policy if exists cafe_products_read on public.cafe_products;
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
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.work_branch_id = cafe_products.branch_id
          and (
            public.has_role(auth.uid(), 'superadmin')
            or public.has_role(auth.uid(), 'group_ceo')
            or public.has_role(auth.uid(), 'sales_manager')
            or public.has_role(auth.uid(), 'rosebank_sales')
            or public.has_role(auth.uid(), 'branch_manager')
            or public.has_role(auth.uid(), 'cafe_manager')
            or public.has_role(auth.uid(), 'community_manager')
            or public.has_role(auth.uid(), 'finance')
          )
      )
    )
  );
