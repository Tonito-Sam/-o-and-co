do $$
declare
  v_kyalami uuid;
  v_bryanston uuid;
  v_union uuid;
  v_finance_user uuid;
begin
  select id into v_kyalami from public.branches where slug = 'kyalami';
  select id into v_bryanston from public.branches where slug = 'bryanston';
  select id into v_union from public.branches where slug = 'union-station';

  if v_kyalami is null then raise exception 'Kyalami branch is missing.'; end if;

  if v_union is not null then
    update public.branches
    set status = 'closed',
        kind = 'Public event venue · Kyalami division',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('parent_branch_slug', 'kyalami')
    where id = v_union;

    update public.organizations set branch_id = v_kyalami where branch_id = v_union;
    update public.organization_members set branch_id = v_kyalami where branch_id = v_union;
    update public.organization_invite_codes set branch_id = v_kyalami where branch_id = v_union;
    update public.tenants set branch_id = v_kyalami where branch_id = v_union;
    update public.leads set branch_id = v_kyalami where branch_id = v_union;
    update public.leads set tour_branch_id = v_kyalami where tour_branch_id = v_union;
    update public.facilities set branch_id = v_kyalami where branch_id = v_union;
    update public.rooms set branch_id = v_kyalami where branch_id = v_union;
    delete from public.branch_sections source
    where source.branch_id = v_union and exists (
      select 1 from public.branch_sections target
      where target.branch_id = v_kyalami and target.section_key = source.section_key
    );
    update public.branch_sections set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_offices source set code = 'US-' || source.code
    where source.branch_id = v_union and exists (
      select 1 from public.branch_offices target where target.branch_id = v_kyalami and target.code = source.code
    );
    update public.branch_desks source set code = 'US-' || source.code
    where source.branch_id = v_union and exists (
      select 1 from public.branch_desks target where target.branch_id = v_kyalami and target.code = source.code
    );
    update public.branch_parking_spaces source set code = 'US-' || source.code
    where source.branch_id = v_union and exists (
      select 1 from public.branch_parking_spaces target where target.branch_id = v_kyalami and target.code = source.code
    );
    update public.branch_equipment source set name = 'Union Station - ' || source.name
    where source.branch_id = v_union and exists (
      select 1 from public.branch_equipment target
      where target.branch_id = v_kyalami and lower(target.name) = lower(source.name)
    );
    update public.branch_offices set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_desks set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_parking_spaces set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_equipment set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_shop_items source set name = 'Union Station - ' || source.name
    where source.branch_id = v_union and exists (
      select 1 from public.branch_shop_items target
      where target.branch_id = v_kyalami and lower(target.name) = lower(source.name)
    );
    update public.branch_shop_items set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_resource_bookings set branch_id = v_kyalami where branch_id = v_union;
    update public.bookings set branch_id = v_kyalami where branch_id = v_union;
    update public.events set branch_id = v_kyalami where branch_id = v_union;
    update public.memberships set branch_id = v_kyalami where branch_id = v_union;
    update public.profiles set work_branch_id = v_kyalami where work_branch_id = v_union;
    update public.cafe_products source set name = 'Union Station - ' || source.name
    where source.branch_id = v_union and exists (
      select 1 from public.cafe_products target
      where target.branch_id = v_kyalami and lower(target.name) = lower(source.name)
    );
    update public.cafe_products set branch_id = v_kyalami where branch_id = v_union;
    update public.cafe_stock_movements set branch_id = v_kyalami where branch_id = v_union;
    update public.cafe_orders set branch_id = v_kyalami where branch_id = v_union;
    update public.branch_shop_orders set branch_id = v_kyalami where branch_id = v_union;

    delete from public.user_roles old_role
    where old_role.branch_id = v_union and exists (
      select 1 from public.user_roles existing
      where existing.user_id = old_role.user_id
        and existing.role = old_role.role and existing.branch_id = v_kyalami
    );
    update public.user_roles set branch_id = v_kyalami where branch_id = v_union;
    delete from public.user_roles where branch_id = v_union;

    update public.invoices
    set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{branch_id}', to_jsonb(v_kyalami::text), true)
    where metadata->>'branch_id' in (v_union::text, 'union-station');
    update public.invoices i
    set metadata = jsonb_set(coalesce(i.metadata, '{}'::jsonb), '{branch_id}', to_jsonb(v_kyalami::text), true)
    from public.union_station_requests request
    where i.union_request_id = request.id;

    update public.branches set status = 'live'
    where id = v_kyalami;
  end if;

  if v_bryanston is not null then
    update public.branches set status = 'closed' where id = v_bryanston;
  end if;

  alter table public.union_station_requests
    add column if not exists branch_id uuid references public.branches(id),
    add column if not exists lead_id uuid references public.leads(id) on delete set null,
    add column if not exists booking_id uuid references public.bookings(id) on delete set null;
  update public.union_station_requests set branch_id = v_kyalami where branch_id is null;
  alter table public.union_station_requests alter column branch_id set not null;
  create index if not exists idx_union_station_requests_branch_date
    on public.union_station_requests(branch_id, event_date);

  drop policy if exists usr_insert on public.union_station_requests;
  create policy usr_insert on public.union_station_requests for insert to authenticated
    with check (submitted_by = auth.uid());

  drop policy if exists usr_select on public.union_station_requests;
  create policy usr_select on public.union_station_requests for select to authenticated using (
    submitted_by = auth.uid()
    or public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
  );
  drop policy if exists usr_update on public.union_station_requests;
  create policy usr_update on public.union_station_requests for update to authenticated
    using (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), branch_id))
    with check (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), branch_id));

  select id into v_finance_user
  from public.profiles where lower(email) = 'finance@officeandco.co.za' limit 1;
  if v_finance_user is not null and not exists (
    select 1 from public.user_roles where user_id = v_finance_user and role::text = 'finance' and branch_id is null
  ) then
    insert into public.user_roles(user_id, role, branch_id)
    values (v_finance_user, 'finance', null);
  end if;
end;
$$;

create or replace function public.parent_branch_id(_branch_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((
    select parent.id
    from public.branches branch
    join public.branches parent on parent.slug = branch.metadata->>'parent_branch_slug'
    where branch.id = _branch_id
  ), _branch_id);
$$;

create or replace function public.is_branch_manager(_user_id uuid, _branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _branch_id is not null and exists (
    select 1 from public.user_roles assignment
    where assignment.user_id = _user_id and assignment.role::text = 'branch_manager'
      and assignment.branch_id in (_branch_id, public.parent_branch_id(_branch_id))
  );
$$;

revoke all on function public.parent_branch_id(uuid) from public;
grant execute on function public.parent_branch_id(uuid) to authenticated, service_role;
revoke all on function public.is_branch_manager(uuid, uuid) from public;
grant execute on function public.is_branch_manager(uuid, uuid) to authenticated, service_role;
