drop policy if exists tickets_select_scope on public.support_tickets;
create policy tickets_select_scope on public.support_tickets for select to authenticated
  using (
    raised_by = auth.uid()
    or assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'superadmin')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  );

drop policy if exists tickets_staff_update on public.support_tickets;
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (
    assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'superadmin')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  )
  with check (
    assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'superadmin')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  );

drop policy if exists support_ticket_messages_select_scope on public.support_ticket_messages;
create policy support_ticket_messages_select_scope
  on public.support_ticket_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id
        and (
          ticket.raised_by = auth.uid()
          or ticket.assignee_id = auth.uid()
          or public.is_branch_manager(auth.uid(), ticket.branch_id)
          or public.has_role(auth.uid(), 'superadmin')
          or public.has_role(auth.uid(), 'group_ceo')
          or public.has_role(auth.uid(), 'community_manager')
          or public.has_role(auth.uid(), 'sales_manager')
        )
    )
  );

drop policy if exists support_ticket_messages_insert_scope on public.support_ticket_messages;
create policy support_ticket_messages_insert_scope
  on public.support_ticket_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id
        and (
          ticket.raised_by = auth.uid()
          or ticket.assignee_id = auth.uid()
          or public.is_branch_manager(auth.uid(), ticket.branch_id)
          or public.has_role(auth.uid(), 'superadmin')
          or public.has_role(auth.uid(), 'group_ceo')
          or public.has_role(auth.uid(), 'community_manager')
          or public.has_role(auth.uid(), 'sales_manager')
        )
    )
  );