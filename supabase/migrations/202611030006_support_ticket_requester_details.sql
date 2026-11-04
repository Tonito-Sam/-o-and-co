alter table public.support_tickets
  add column if not exists requester_name text,
  add column if not exists organization_name text;

create or replace function public.set_support_ticket_requester_details()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(btrim(profile.full_name), ''), profile.email, 'Unknown requester')
  into new.requester_name
  from public.profiles profile
  where profile.id = new.raised_by;
  new.requester_name := coalesce(new.requester_name, 'Unknown requester');

  select coalesce(
    (
      select nullif(btrim(organization.name), '')
      from public.organization_members membership
      join public.organizations organization on organization.id = membership.organization_id
      where membership.user_id = new.raised_by and membership.status = 'active'
      limit 1
    ),
    (
      select company.name
      from public.tenants tenant
      join public.companies company on company.id = tenant.company_id
      where tenant.id = new.tenant_id
      limit 1
    ),
    'Not linked'
  ) into new.organization_name;

  return new;
end;
$$;

revoke all on function public.set_support_ticket_requester_details() from public, anon, authenticated;

drop trigger if exists trg_set_support_ticket_requester_details on public.support_tickets;
create trigger trg_set_support_ticket_requester_details
before insert or update on public.support_tickets
for each row execute function public.set_support_ticket_requester_details();

update public.support_tickets ticket
set requester_name = coalesce(
      (select coalesce(nullif(btrim(profile.full_name), ''), profile.email)
       from public.profiles profile where profile.id = ticket.raised_by),
      'Unknown requester'
    ),
    organization_name = coalesce(
      (select nullif(btrim(organization.name), '')
       from public.organization_members membership
       join public.organizations organization on organization.id = membership.organization_id
       where membership.user_id = ticket.raised_by and membership.status = 'active'
       limit 1),
      (select company.name
       from public.tenants tenant
       join public.companies company on company.id = tenant.company_id
       where tenant.id = ticket.tenant_id
       limit 1),
      'Not linked'
    );

notify pgrst, 'reload schema';
