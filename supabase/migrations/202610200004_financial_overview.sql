create or replace function public.get_financial_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_branch_ids uuid[];
  v_is_global boolean;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Sign in to view financial performance.'; end if;

  v_is_global := public.is_global_tenant_staff(v_user_id) or public.is_platform_admin(v_user_id);
  if v_is_global then
    select coalesce(array_agg(id), '{}'::uuid[]) into v_branch_ids
    from public.branches where status = 'live';
  else
    select coalesce(array_agg(distinct branch_id), '{}'::uuid[]) into v_branch_ids
    from public.user_roles
    where user_id = v_user_id and role::text = 'branch_manager' and branch_id is not null;
    if cardinality(v_branch_ids) = 0 then
      raise exception 'You do not have access to a branch financial overview.';
    end if;
  end if;

  with scoped_branches as (
    select b.id, b.name, b.capacity
    from public.branches b
    where b.status = 'live' and b.id = any(v_branch_ids)
  ), invoice_branch as (
    select i.id, i.amount_zar, i.status, i.issued_at, i.paid_at,
      coalesce(t.branch_id, booking.branch_id, resource_booking.branch_id, metadata_branch.id) as branch_id
    from public.invoices i
    left join public.tenants t on t.id = i.tenant_id
    left join public.bookings booking on booking.id = i.booking_id
    left join public.branch_resource_bookings resource_booking on resource_booking.id = i.resource_booking_id
    left join public.branches metadata_branch
      on metadata_branch.id::text = i.metadata->>'branch_id'
      or metadata_branch.slug = i.metadata->>'branch_id'
  ), branch_rows as (
    select b.id, b.name, coalesce(b.capacity, 0) as capacity,
      coalesce((select count(*) from public.tenants t where t.branch_id = b.id and t.status = 'active'), 0) as active_tenants,
      coalesce((select sum(t.desks) from public.tenants t where t.branch_id = b.id and t.status = 'active'), 0) as occupied_desks,
      coalesce((select sum(t.mrr_zar) from public.tenants t where t.branch_id = b.id and t.status = 'active'), 0) as monthly_recurring,
      coalesce((select sum(i.amount_zar) from invoice_branch i
        where i.branch_id = b.id and i.status = 'paid'
          and i.paid_at >= date_trunc('month', current_date)::date), 0) as collected_this_month,
      coalesce((select sum(i.amount_zar) from invoice_branch i
        where i.branch_id = b.id and i.status not in ('paid', 'void')), 0) as open_receivables,
      coalesce((select sum(i.amount_zar) from invoice_branch i
        where i.branch_id = b.id and i.status = 'overdue'), 0) as overdue_receivables,
      coalesce((select count(*) from public.leads l
        where l.branch_id = b.id and l.sales_stage not in ('Active Tenant', 'Lost')), 0) as open_leads,
      coalesce((select sum(l.value_zar) from public.leads l
        where l.branch_id = b.id and l.sales_stage not in ('Active Tenant', 'Lost')), 0) as pipeline_value,
      coalesce((select count(*) from public.bookings bk
        where bk.branch_id = b.id and bk.status = 'held'), 0)
      + coalesce((select count(*) from public.branch_resource_bookings rb
        where rb.branch_id = b.id and rb.status = 'requested'), 0) as pending_bookings
    from scoped_branches b
  ), monthly_rows as (
    select month_start,
      coalesce(sum(i.amount_zar) filter (where i.status = 'paid'), 0) as collected,
      coalesce(sum(i.amount_zar) filter (where i.status not in ('paid', 'void')), 0) as outstanding
    from generate_series(
      date_trunc('month', current_date)::date - interval '11 months',
      date_trunc('month', current_date)::date,
      interval '1 month'
    ) as months(month_start)
    left join invoice_branch i on i.branch_id = any(v_branch_ids)
      and date_trunc('month', coalesce(i.paid_at, i.issued_at)) = month_start
    group by month_start
  )
  select jsonb_build_object(
    'scope', case when v_is_global then 'group' else 'branch' end,
    'totals', jsonb_build_object(
      'monthly_recurring', coalesce((select sum(monthly_recurring) from branch_rows), 0),
      'collected_this_month', coalesce((select sum(collected_this_month) from branch_rows), 0),
      'open_receivables', coalesce((select sum(open_receivables) from branch_rows), 0),
      'overdue_receivables', coalesce((select sum(overdue_receivables) from branch_rows), 0),
      'active_tenants', coalesce((select sum(active_tenants) from branch_rows), 0),
      'open_leads', coalesce((select sum(open_leads) from branch_rows), 0),
      'pipeline_value', coalesce((select sum(pipeline_value) from branch_rows), 0),
      'pending_bookings', coalesce((select sum(pending_bookings) from branch_rows), 0)
    ),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'capacity', capacity,
        'active_tenants', active_tenants, 'monthly_recurring', monthly_recurring,
        'occupied_desks', occupied_desks,
        'desk_occupancy_percent', case when capacity > 0 then least(100, round(occupied_desks::numeric / capacity * 100)::integer) else 0 end,
        'collected_this_month', collected_this_month, 'open_receivables', open_receivables,
        'overdue_receivables', overdue_receivables, 'open_leads', open_leads,
        'pipeline_value', pipeline_value, 'pending_bookings', pending_bookings,
        'risk_score', least(100, round(overdue_receivables::numeric / greatest(monthly_recurring, 1) * 100)::integer)
      ) order by overdue_receivables desc, name)
      from branch_rows
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(month_start, 'Mon YY'),
        'collected', collected,
        'outstanding', outstanding
      ) order by month_start)
      from monthly_rows
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_financial_overview() from public;
grant execute on function public.get_financial_overview() to authenticated;
