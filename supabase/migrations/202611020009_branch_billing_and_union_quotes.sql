create or replace function public.submit_union_station_quote(
  p_request_id uuid,
  p_quote_amount_zar integer,
  p_quote_notes text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_request public.union_station_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to prepare a Union Station quote.'; end if;
  if p_quote_amount_zar is null or p_quote_amount_zar < 1 or p_quote_amount_zar > 10000000 then
    raise exception 'Enter a valid quote amount.';
  end if;
  if length(coalesce(p_quote_notes, '')) > 2000 then raise exception 'Quote notes are too long.'; end if;

  select * into v_request
  from public.union_station_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Union Station request not found.'; end if;
  if v_request.status not in ('submitted', 'in_review') then
    raise exception 'Only submitted or in-review requests can be quoted.';
  end if;
  if not (
    public.is_global_crm_staff(auth.uid())
    or public.has_role(auth.uid(), 'group_ceo')
    or public.is_platform_admin(auth.uid())
    or public.is_branch_manager(auth.uid(), v_request.branch_id)
  ) then raise exception 'You cannot prepare quotes for this branch.'; end if;

  update public.union_station_requests set
    estimate_zar = p_quote_amount_zar,
    status = 'quoted'::public.us_status,
    approver_id = auth.uid(),
    approved_at = now()
  where id = p_request_id;

  insert into public.union_station_approvals(request_id, actor_id, from_status, to_status, comment)
  values (p_request_id, auth.uid(), v_request.status, 'quoted'::public.us_status, nullif(btrim(p_quote_notes), ''));

  if v_request.lead_id is not null then
    update public.leads set stage = 'proposal_sent', sales_stage = 'Proposal Sent'
    where id = v_request.lead_id;
  end if;

  return v_request.reference;
end;
$$;

revoke all on function public.submit_union_station_quote(uuid, integer, text) from public;
grant execute on function public.submit_union_station_quote(uuid, integer, text) to authenticated;

create or replace function public.issue_one_off_booking_invoice(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_reference text := 'OCO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_due_at date := current_date + 7;
  v_payload jsonb;
  v_email_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if auth.uid() is null then raise exception 'Sign in to issue this invoice.'; end if;

  select request.*, lead.contact_name, lead.company_name, lead.contact_email, branch.name as branch_name
  into v_booking
  from public.bookings request
  join public.leads lead on lead.id = request.lead_id
  join public.branches branch on branch.id = request.branch_id
  where request.id = p_booking_id and request.request_status = 'quoted'
  for update of request;
  if not found then raise exception 'This request is no longer awaiting invoicing.'; end if;
  if not (
    public.has_role(auth.uid(), 'finance')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.is_platform_admin(auth.uid())
    or public.is_branch_manager(auth.uid(), v_booking.branch_id)
  ) then raise exception 'You cannot issue invoices for this branch.'; end if;

  insert into public.invoices (id, reference, booking_id, amount_zar, status, issued_at, due_at, metadata)
  values (
    v_invoice_id, v_invoice_reference, p_booking_id, v_booking.quote_amount_zar, 'sent', current_date, v_due_at,
    jsonb_build_object(
      'kind', 'one_off_booking', 'lead_id', v_booking.lead_id, 'branch_id', v_booking.branch_id,
      'request_reference', v_booking.request_reference, 'space_name', v_booking.space_name,
      'guests', v_booking.guests, 'quote_notes', v_booking.quote_notes
    )
  );

  update public.bookings set
    request_status = 'invoice_sent', invoice_reference = v_invoice_reference,
    invoice_sent_at = now(), email_dispatch_token = v_email_token
  where id = p_booking_id;

  v_payload := jsonb_build_object(
    'request_reference', v_booking.request_reference,
    'invoice_reference', v_invoice_reference,
    'contact_name', v_booking.contact_name,
    'company_name', v_booking.company_name,
    'branch_name', v_booking.branch_name,
    'space_name', v_booking.space_name,
    'booking_date', (v_booking.starts_at at time zone 'Africa/Johannesburg')::date,
    'starts_at', (v_booking.starts_at at time zone 'Africa/Johannesburg')::time,
    'ends_at', (v_booking.ends_at at time zone 'Africa/Johannesburg')::time,
    'guests', v_booking.guests,
    'amount_zar', v_booking.quote_amount_zar,
    'due_at', v_due_at
  );
  insert into public.booking_email_outbox (booking_id, event, recipient_email, payload)
  values (p_booking_id, 'invoice_sent', lower(btrim(v_booking.contact_email)), v_payload)
  on conflict (booking_id, event, recipient_email) do nothing;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_reference', v_invoice_reference,
    'due_at', v_due_at,
    'email_token', v_email_token
  );
end;
$$;

revoke all on function public.issue_one_off_booking_invoice(uuid) from public;
grant execute on function public.issue_one_off_booking_invoice(uuid) to authenticated;

drop policy if exists invoices_branch_manager_read on public.invoices;
create policy invoices_branch_manager_read on public.invoices for select to authenticated using (
  exists (
    select 1 from public.user_roles assigned
    where assigned.user_id = auth.uid()
      and assigned.role::text = 'branch_manager'
      and invoices.metadata->>'branch_id' = assigned.branch_id::text
  )
);