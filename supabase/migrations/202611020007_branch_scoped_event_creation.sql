drop policy if exists events_staff_write on public.events;

create policy events_staff_write on public.events for all to authenticated
  using (
    public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.is_platform_admin(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
  )
  with check (
    public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.is_platform_admin(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
  );