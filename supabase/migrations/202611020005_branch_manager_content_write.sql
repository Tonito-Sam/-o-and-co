drop policy if exists content_staff_write on public.content_items;

create policy content_staff_write on public.content_items for all to authenticated
  using (
    public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'branch_manager')
  )
  with check (
    public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'branch_manager')
  );