create or replace function public.notify_support_ticket_branch_managers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null then return new; end if;

  insert into public.notifications(profile_id, title, body, url)
  select distinct assigned.user_id,
    'New support request · ' || branch.name,
    coalesce(new.reference, 'Support request') || ' · ' || new.subject,
    '/support'
  from public.user_roles assigned
  join public.branches branch on branch.id = new.branch_id
  where assigned.role::text = 'branch_manager'
    and assigned.branch_id = new.branch_id
    and assigned.user_id is distinct from new.raised_by;

  return new;
end;
$$;

revoke all on function public.notify_support_ticket_branch_managers() from public, anon, authenticated;

drop trigger if exists trg_notify_support_ticket_branch_managers on public.support_tickets;
create trigger trg_notify_support_ticket_branch_managers
after insert on public.support_tickets
for each row execute function public.notify_support_ticket_branch_managers();
