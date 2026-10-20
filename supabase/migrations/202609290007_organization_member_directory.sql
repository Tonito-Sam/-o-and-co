create or replace function public.can_view_organization_profile(_viewer_id uuid, _profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organization_members viewer
    join public.organization_members subject
      on subject.organization_id = viewer.organization_id
    where viewer.user_id = _viewer_id
      and viewer.role = 'admin'
      and viewer.status = 'active'
      and subject.user_id = _profile_id
      and subject.status = 'active'
  );
$$;

revoke all on function public.can_view_organization_profile(uuid, uuid) from public;
grant execute on function public.can_view_organization_profile(uuid, uuid) to authenticated, service_role;

drop policy if exists profiles_organization_admin_select on public.profiles;
create policy profiles_organization_admin_select on public.profiles for select to authenticated
  using (public.can_view_organization_profile(auth.uid(), id));

drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_organization_role(auth.uid(), organization_id)
    or public.is_office_co_staff(auth.uid())
  );
