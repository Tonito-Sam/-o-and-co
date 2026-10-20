do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_branch_fk') then
    alter table public.user_roles
      add constraint user_roles_branch_fk foreign key (branch_id) references public.branches(id) on delete cascade;
  end if;
end $$;

do $$ begin
  delete from public.user_roles a
  using public.user_roles b
  where a.user_id = b.user_id and a.role = b.role
    and coalesce(a.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(b.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and a.ctid > b.ctid;
end $$;
create unique index if not exists idx_user_roles_scoped_unique
  on public.user_roles(user_id, role, (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)));

create or replace function public.is_platform_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text in ('superadmin', 'group_admin')
  );
$$;

create or replace function public.is_branch_manager(_user_id uuid, _branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _branch_id is not null and exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text = 'branch_manager' and branch_id = _branch_id
  );
$$;

create or replace function public.can_manage_branch(_user_id uuid, _branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin(_user_id)
    or public.has_role(_user_id, 'group_ceo')
    or public.is_branch_manager(_user_id, _branch_id);
$$;

create or replace function public.is_global_crm_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('superadmin', 'group_admin', 'group_ceo', 'crm_manager', 'sales_manager')
  );
$$;

create or replace function public.is_global_tenant_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('superadmin', 'group_admin', 'group_ceo', 'crm_manager', 'sales_manager', 'finance')
  );
$$;

create or replace function public.is_office_co_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in (
        'superadmin', 'group_admin', 'group_ceo', 'crm_manager', 'sales_manager',
        'rosebank_sales', 'branch_manager', 'cafe_manager', 'community_manager', 'finance'
      )
  );
$$;

create or replace function public.is_sales_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_crm_staff(_user_id)
    or exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'finance');
$$;

create or replace function public.assign_staff_role(
  p_user_id uuid,
  p_role text,
  p_branch_id uuid,
  p_assign boolean default true
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
begin
  if p_role not in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales', 'sales_manager', 'crm_manager', 'finance') then
    raise exception 'This platform role cannot be assigned from this screen.';
  end if;
  if p_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') and p_branch_id is null then
    raise exception 'Choose a branch for this role.';
  end if;
  if p_role in ('sales_manager', 'crm_manager', 'finance') and p_branch_id is not null then
    raise exception 'This role has group-wide scope and cannot be assigned to one branch.';
  end if;
  if p_branch_id is not null and not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Choose a live branch.';
  end if;

  if not (public.is_platform_admin(auth.uid()) or public.has_role(auth.uid(), 'group_ceo')) then
    if p_role not in ('cafe_manager', 'community_manager')
      or not public.is_branch_manager(auth.uid(), p_branch_id) then
      raise exception 'You can only assign café or community managers in your own branch.';
    end if;
  end if;

  v_role := p_role::public.app_role;
  if p_assign then
    if not exists (
      select 1 from public.user_roles
      where user_id = p_user_id and role = v_role
        and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      insert into public.user_roles(user_id, role, branch_id) values (p_user_id, v_role, p_branch_id);
    end if;
    if v_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') then
      update public.profiles set work_branch_id = p_branch_id where id = p_user_id;
    end if;
  else
    delete from public.user_roles where user_id = p_user_id and role = v_role
      and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') then
      update public.profiles set work_branch_id = (
        select branch_id from public.user_roles
        where user_id = p_user_id and role::text in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales')
          and branch_id is not null
        order by id
        limit 1
      ) where id = p_user_id;
    end if;
  end if;
end;
$$;

revoke all on function public.is_platform_admin(uuid) from public;
revoke all on function public.is_branch_manager(uuid, uuid) from public;
revoke all on function public.can_manage_branch(uuid, uuid) from public;
revoke all on function public.is_global_crm_staff(uuid) from public;
revoke all on function public.is_global_tenant_staff(uuid) from public;
revoke all on function public.assign_staff_role(uuid, text, uuid, boolean) from public;
revoke all on function public.is_sales_staff(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.is_branch_manager(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_global_crm_staff(uuid) to authenticated, service_role;
grant execute on function public.is_global_tenant_staff(uuid) to authenticated, service_role;
grant execute on function public.assign_staff_role(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.is_sales_staff(uuid) to authenticated, service_role;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (
  auth.uid() = id or public.is_platform_admin(auth.uid()) or public.has_role(auth.uid(), 'group_ceo')
  or exists (
    select 1 from public.user_roles viewer
    where viewer.user_id = auth.uid() and viewer.role = 'branch_manager'
      and viewer.branch_id = profiles.work_branch_id and profiles.work_branch_id is not null
  )
  or exists (
    select 1 from public.user_roles assigned
    join public.user_roles viewer on viewer.branch_id = assigned.branch_id
    where assigned.user_id = profiles.id and viewer.user_id = auth.uid()
      and viewer.role = 'branch_manager' and assigned.branch_id is not null
  )
);

drop policy if exists user_roles_admin_select on public.user_roles;
create policy user_roles_admin_select on public.user_roles for select to authenticated using (
  public.is_platform_admin(auth.uid())
  or public.has_role(auth.uid(), 'group_ceo')
  or public.is_branch_manager(auth.uid(), branch_id)
);

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated using (
  public.has_organization_role(auth.uid(), id)
  or public.is_global_crm_staff(auth.uid())
  or public.is_global_tenant_staff(auth.uid())
  or public.is_branch_manager(auth.uid(), branch_id)
);

drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated using (
  user_id = auth.uid()
  or public.has_organization_role(auth.uid(), organization_id, 'admin')
  or public.is_global_crm_staff(auth.uid())
  or public.is_global_tenant_staff(auth.uid())
  or exists (
    select 1 from public.organizations o
    where o.id = organization_id and public.is_branch_manager(auth.uid(), o.branch_id)
  )
);

drop policy if exists branch_sections_manage on public.branch_sections;
create policy branch_sections_manage on public.branch_sections for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));

drop policy if exists branch_offices_manage on public.branch_offices;
create policy branch_offices_manage on public.branch_offices for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));
drop policy if exists branch_desks_manage on public.branch_desks;
create policy branch_desks_manage on public.branch_desks for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));
drop policy if exists branch_parking_manage on public.branch_parking_spaces;
create policy branch_parking_manage on public.branch_parking_spaces for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));
drop policy if exists branch_equipment_manage on public.branch_equipment;
create policy branch_equipment_manage on public.branch_equipment for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));
drop policy if exists branch_shop_items_manage on public.branch_shop_items;
create policy branch_shop_items_manage on public.branch_shop_items for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));

drop policy if exists rooms_staff_write on public.rooms;
create policy rooms_staff_write on public.rooms for all to authenticated
  using (public.can_manage_branch(auth.uid(), branch_id))
  with check (public.can_manage_branch(auth.uid(), branch_id));

drop policy if exists branch_resource_bookings_read on public.branch_resource_bookings;
create policy branch_resource_bookings_read on public.branch_resource_bookings for select to authenticated
  using (
    booked_by = auth.uid()
    or public.is_global_crm_staff(auth.uid())
    or public.is_global_tenant_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
  );
drop policy if exists branch_resource_bookings_update on public.branch_resource_bookings;
create policy branch_resource_bookings_update on public.branch_resource_bookings for update to authenticated
  using (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), branch_id))
  with check (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), branch_id));

drop policy if exists bookings_self_or_staff on public.bookings;
create policy bookings_self_or_staff on public.bookings for select to authenticated using (
  booked_by = auth.uid()
  or public.is_global_crm_staff(auth.uid())
  or public.is_global_tenant_staff(auth.uid())
  or public.is_branch_manager(auth.uid(), coalesce(branch_id, (select r.branch_id from public.rooms r where r.id = room_id)))
);
drop policy if exists bookings_insert_auth on public.bookings;
create policy bookings_insert_auth on public.bookings for insert to authenticated with check (
  booked_by = auth.uid()
  or public.can_manage_branch(auth.uid(), coalesce(branch_id, (select r.branch_id from public.rooms r where r.id = room_id)))
);
drop policy if exists bookings_one_off_staff_read on public.bookings;
create policy bookings_one_off_staff_read on public.bookings for select to authenticated using (
  lead_id is not null and (
    public.is_global_crm_staff(auth.uid())
    or public.is_branch_manager(auth.uid(), branch_id)
  )
);

drop policy if exists tenants_auth_read on public.tenants;
create policy tenants_auth_read on public.tenants for select to authenticated using (
  public.is_global_tenant_staff(auth.uid())
  or public.is_branch_manager(auth.uid(), branch_id)
  or (organization_id is not null and public.has_organization_role(auth.uid(), organization_id))
);

drop policy if exists companies_auth_read on public.companies;
create policy companies_auth_read on public.companies for select to authenticated using (
  public.is_global_tenant_staff(auth.uid())
  or exists (
    select 1 from public.tenants t where t.company_id = companies.id
      and public.is_branch_manager(auth.uid(), t.branch_id)
  )
);
drop policy if exists companies_auth_write on public.companies;
create policy companies_auth_write on public.companies for all to authenticated
  using (public.is_platform_admin(auth.uid()) or public.has_role(auth.uid(), 'group_ceo') or public.is_global_crm_staff(auth.uid()))
  with check (public.is_platform_admin(auth.uid()) or public.has_role(auth.uid(), 'group_ceo') or public.is_global_crm_staff(auth.uid()));

drop policy if exists leads_sales on public.leads;
create policy leads_sales on public.leads for all to authenticated
  using (
    public.is_global_crm_staff(auth.uid())
    or owner_id = auth.uid()
    or (branch_id is not null and public.is_branch_manager(auth.uid(), branch_id))
  )
  with check (
    public.is_global_crm_staff(auth.uid())
    or owner_id = auth.uid()
    or (branch_id is not null and public.is_branch_manager(auth.uid(), branch_id))
  );

drop policy if exists lead_activities_staff_read on public.lead_activities;
create policy lead_activities_staff_read on public.lead_activities for select to authenticated using (
  exists (select 1 from public.leads l where l.id = lead_id)
);

create or replace function public.link_lead_to_organization(p_lead_id uuid, p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id from public.leads where id = p_lead_id;
  if not found then raise exception 'Lead not found.'; end if;
  if not (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), v_branch_id)) then
    raise exception 'You cannot link organizations to leads outside your scope.';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Organization not found.'; end if;
  if not public.is_global_crm_staff(auth.uid())
    and not public.is_branch_manager(auth.uid(), (select branch_id from public.organizations where id = p_organization_id)) then
    raise exception 'You cannot link organizations outside your branch.';
  end if;
  update public.organizations set lead_id = null where lead_id = p_lead_id and id <> p_organization_id;
  update public.organizations set lead_id = p_lead_id where id = p_organization_id and lead_id is null;
  update public.leads set organization_id = p_organization_id where id = p_lead_id;
end;
$$;

create or replace function public.activate_lead_as_tenant(
  p_lead_id uuid,
  p_branch_id uuid,
  p_tier text,
  p_plan_name text,
  p_desks integer,
  p_mrr_zar integer,
  p_since date,
  p_lease_signed_at date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads%rowtype;
  v_branch_id uuid;
  v_tenant_id uuid;
  v_existing_source_lead uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if v_lead.opportunity_type <> 'workspace' then raise exception 'Only workspace opportunities can become tenants.'; end if;
  if v_lead.organization_id is null then raise exception 'Register and link the organization before recording its lease.'; end if;
  if v_lead.sales_stage not in ('Contract Signed', 'Onboarding', 'Active Tenant') then
    raise exception 'Move the lead to Contract Signed before recording the lease.';
  end if;
  if p_since is null or p_lease_signed_at is null then raise exception 'Lease signed and start dates are required.'; end if;
  if coalesce(p_desks, -1) < 0 or coalesce(p_mrr_zar, -1) < 0 then raise exception 'Desks and monthly fee cannot be negative.'; end if;

  v_branch_id := coalesce(p_branch_id, v_lead.branch_id, (select branch_id from public.organizations where id = v_lead.organization_id));
  if v_branch_id is null or not exists (select 1 from public.branches where id = v_branch_id and status = 'live') then
    raise exception 'Choose an active Office & Co branch.';
  end if;
  if not (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), v_branch_id)) then
    raise exception 'You cannot activate tenants outside your scope.';
  end if;

  select id, source_lead_id into v_tenant_id, v_existing_source_lead
  from public.tenants
  where source_lead_id = p_lead_id
     or (organization_id = v_lead.organization_id and branch_id = v_branch_id and status = 'active')
  order by (source_lead_id = p_lead_id) desc nulls last
  limit 1
  for update;
  if v_tenant_id is not null and v_existing_source_lead is not null and v_existing_source_lead <> p_lead_id then
    raise exception 'This organization already has an active lease at the selected branch.';
  end if;

  if v_tenant_id is null then
    insert into public.tenants (
      organization_id, company_id, source_lead_id, branch_id, tier, plan_name,
      desks, mrr_zar, since, lease_signed_at, status
    ) values (
      v_lead.organization_id, null, p_lead_id, v_branch_id, p_tier::public.subscription_tier,
      nullif(btrim(p_plan_name), ''), p_desks, p_mrr_zar, p_since, p_lease_signed_at, 'active'
    ) returning id into v_tenant_id;
  else
    update public.tenants set
      organization_id = v_lead.organization_id, source_lead_id = p_lead_id,
      branch_id = v_branch_id, tier = p_tier::public.subscription_tier,
      plan_name = nullif(btrim(p_plan_name), ''), desks = p_desks, mrr_zar = p_mrr_zar,
      since = p_since, lease_signed_at = p_lease_signed_at, status = 'active'
    where id = v_tenant_id;
  end if;
  update public.leads set stage = 'won', sales_stage = 'Active Tenant' where id = p_lead_id;
  return v_tenant_id;
end;
$$;

create or replace function public.update_one_off_booking_status(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
begin
  if p_status not in ('confirmed', 'cancelled') then raise exception 'Choose a valid booking status.'; end if;
  select branch_id into v_branch_id from public.bookings where id = p_booking_id and lead_id is not null for update;
  if v_branch_id is null then raise exception 'Pending one-off booking request not found.'; end if;
  if not (public.is_global_crm_staff(auth.uid()) or public.is_branch_manager(auth.uid(), v_branch_id)) then
    raise exception 'You cannot manage booking requests for this branch.';
  end if;
  update public.bookings set status = p_status::public.booking_status where id = p_booking_id and status = 'held';
  if not found then raise exception 'Pending one-off booking request not found.'; end if;
end;
$$;

create or replace function public.notify_branch_booking_managers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_space text := coalesce(new.space_name, 'Space booking');
begin
  v_branch_id := coalesce(new.branch_id, (select branch_id from public.rooms where id = new.room_id));
  if v_branch_id is null then return new; end if;
  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id, 'New booking request · ' || branch.name,
    v_space || ' · ' || to_char(new.starts_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI'), '/bookings'
  from public.user_roles assigned
  join public.branches branch on branch.id = v_branch_id
  where (assigned.role = 'branch_manager' and assigned.branch_id = v_branch_id)
     or assigned.role::text in ('group_admin', 'group_ceo', 'crm_manager');
  return new;
end;
$$;
drop trigger if exists trg_notify_branch_booking_managers on public.bookings;
create trigger trg_notify_branch_booking_managers
after insert on public.bookings
for each row
execute function public.notify_branch_booking_managers();

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.notify_branch_resource_managers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resource_name text;
begin
  select coalesce(o.name, d.name, p.name, e.name, 'Resource booking') into v_resource_name
  from public.branch_resource_bookings booking
  left join public.branch_offices o on o.id = booking.office_id
  left join public.branch_desks d on d.id = booking.desk_id
  left join public.branch_parking_spaces p on p.id = booking.parking_space_id
  left join public.branch_equipment e on e.id = booking.equipment_id
  where booking.id = new.id;
  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id, 'New resource request · ' || branch.name,
    coalesce(v_resource_name, 'Resource booking') || ' · ' || to_char(new.starts_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI'), '/bookings'
  from public.user_roles assigned
  join public.branches branch on branch.id = new.branch_id
  where (assigned.role = 'branch_manager' and assigned.branch_id = new.branch_id)
     or assigned.role::text in ('group_admin', 'group_ceo', 'crm_manager');
  return new;
end;
$$;
drop trigger if exists trg_notify_branch_resource_managers on public.branch_resource_bookings;
create trigger trg_notify_branch_resource_managers
after insert on public.branch_resource_bookings
for each row execute function public.notify_branch_resource_managers();

create or replace function public.set_seed_staff_role(p_email text, p_role text, p_branch_slug text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_branch_id uuid;
  v_role public.app_role;
begin
  select id into v_user_id from public.profiles where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then return; end if;
  v_role := p_role::public.app_role;
  if p_branch_slug is not null then
    select id into v_branch_id from public.branches where slug = p_branch_slug;
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = v_role
      and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(v_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    insert into public.user_roles(user_id, role, branch_id) values (v_user_id, v_role, v_branch_id);
  end if;
  if v_role in ('branch_manager', 'cafe_manager', 'community_manager', 'rosebank_sales') then
    update public.profiles set work_branch_id = v_branch_id where id = v_user_id;
  end if;
end;
$$;

select public.set_seed_staff_role('anthonyceo@officeandco.co.za', 'group_ceo');
select public.set_seed_staff_role('samanthakyalami@officeandco.co.za', 'group_admin');
select public.set_seed_staff_role('vashnitech@yahoo.com', 'crm_manager');
delete from public.user_roles
where user_id = (select id from public.profiles where lower(email) = 'reginarosebank@officeandco.co.za')
  and role = 'rosebank_sales';
select public.set_seed_staff_role('reginarosebank@officeandco.co.za', 'branch_manager', 'rosebank');
select public.set_seed_staff_role('lydiakyalami@officeandco.co.za', 'branch_manager', 'kyalami');
select public.set_seed_staff_role('lydiakyalami@officeandco.co.za', 'branch_manager', 'union-station');
drop function public.set_seed_staff_role(text, text, text);
