drop policy if exists tickets_scope on public.support_tickets;
drop policy if exists tickets_select_scope on public.support_tickets;
drop policy if exists tickets_member_insert on public.support_tickets;
drop policy if exists tickets_staff_update on public.support_tickets;

create policy tickets_select_scope on public.support_tickets for select to authenticated
  using (
    raised_by = auth.uid()
    or assignee_id = auth.uid()
    or public.has_role(auth.uid(),'branch_manager')
    or public.has_role(auth.uid(),'community_manager')
    or public.has_role(auth.uid(),'group_ceo')
    or public.has_role(auth.uid(),'sales_manager')
  );

create policy tickets_member_insert on public.support_tickets for insert to authenticated
  with check (
    raised_by = auth.uid()
    and (
      public.is_office_co_staff(auth.uid())
      or exists (
        select 1 from public.organization_members m
        where m.user_id = auth.uid()
          and m.branch_id = branch_id
          and m.status = 'active'
      )
      or exists (
        select 1 from public.user_roles r
        where r.user_id = auth.uid()
          and r.branch_id = branch_id
          and r.role::text = 'tenant_admin'
      )
    )
  );

create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (
    assignee_id = auth.uid()
    or public.has_role(auth.uid(),'branch_manager')
    or public.has_role(auth.uid(),'community_manager')
    or public.has_role(auth.uid(),'group_ceo')
    or public.has_role(auth.uid(),'sales_manager')
  )
  with check (
    assignee_id = auth.uid()
    or public.has_role(auth.uid(),'branch_manager')
    or public.has_role(auth.uid(),'community_manager')
    or public.has_role(auth.uid(),'group_ceo')
    or public.has_role(auth.uid(),'sales_manager')
  );
