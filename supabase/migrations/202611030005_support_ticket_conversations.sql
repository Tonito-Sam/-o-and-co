create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(btrim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket_created
  on public.support_ticket_messages(ticket_id, created_at);

grant select, insert on public.support_ticket_messages to authenticated;
grant all on public.support_ticket_messages to service_role;
alter table public.support_ticket_messages enable row level security;

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
          or public.has_role(auth.uid(), 'group_ceo')
          or public.has_role(auth.uid(), 'community_manager')
          or public.has_role(auth.uid(), 'sales_manager')
        )
    )
  );

drop policy if exists tickets_select_scope on public.support_tickets;
create policy tickets_select_scope on public.support_tickets for select to authenticated
  using (
    raised_by = auth.uid()
    or assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  );

drop policy if exists tickets_staff_update on public.support_tickets;
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (
    assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  )
  with check (
    assignee_id = auth.uid()
    or public.is_branch_manager(auth.uid(), branch_id)
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'community_manager')
    or public.has_role(auth.uid(), 'sales_manager')
  );

create or replace function public.notify_support_ticket_message_participants()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  select * into v_ticket from public.support_tickets where id = new.ticket_id;
  if not found then return new; end if;

  if new.author_id = v_ticket.raised_by then
    insert into public.notifications(profile_id, title, body, url)
    select distinct assigned.user_id,
      'Support request updated',
      coalesce(v_ticket.reference, 'Support request') || ' · ' || left(new.message, 180),
      '/support'
    from public.user_roles assigned
    where assigned.role::text = 'branch_manager'
      and assigned.branch_id = v_ticket.branch_id
      and assigned.user_id is distinct from new.author_id;
  elsif v_ticket.raised_by is not null then
    insert into public.notifications(profile_id, title, body, url)
    values (
      v_ticket.raised_by,
      'Support team replied',
      coalesce(v_ticket.reference, 'Support request') || ' · ' || left(new.message, 180),
      '/support'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_support_ticket_message_participants() from public, anon, authenticated;

drop trigger if exists trg_notify_support_ticket_message_participants on public.support_ticket_messages;
create trigger trg_notify_support_ticket_message_participants
after insert on public.support_ticket_messages
for each row execute function public.notify_support_ticket_message_participants();
