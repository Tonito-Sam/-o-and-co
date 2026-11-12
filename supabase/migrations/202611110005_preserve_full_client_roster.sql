alter table public.tenants
  add column if not exists lease_term text,
  add column if not exists rental_end_date date,
  add column if not exists next_escalation_date date,
  add column if not exists deposit_paid_zar numeric(12, 2),
  add column if not exists source_data jsonb not null default '{}'::jsonb;

drop index if exists public.idx_tenants_branch_office_number;
create unique index if not exists idx_tenants_branch_company_office_number
  on public.tenants(branch_id, company_id, office_number)
  where company_id is not null and office_number is not null;

create or replace function public.import_client_roster(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_index integer := 0;
  v_imported integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_branch_id uuid;
  v_company_id uuid;
  v_organization_id uuid;
  v_tenant_id uuid;
  v_branch text;
  v_name text;
  v_normalized_name text;
  v_office_number text;
  v_rent numeric(12, 2);
  v_office_size numeric(10, 2);
  v_deposit numeric(12, 2);
  v_desks integer;
  v_tier public.subscription_tier;
  v_industry text;
  v_lease_start date;
  v_lease_end date;
  v_escalation_date date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This roster import is restricted to the service role.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Provide tenant roster rows as a JSON array.';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Import no more than 500 tenant rows at a time.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      v_name := btrim(coalesce(v_row->>'organization_name', ''));
      v_branch := btrim(coalesce(v_row->>'branch', ''));
      v_office_number := btrim(coalesce(v_row->>'office_number', ''));
      if length(v_name) < 2 then raise exception 'Company name is required.'; end if;
      if v_office_number = '' then raise exception 'Office number is required.'; end if;

      select id into v_branch_id
      from public.branches
      where status::text = 'live'
        and (lower(name) = lower(v_branch) or lower(slug) = lower(v_branch))
      limit 1;
      if v_branch_id is null then raise exception 'Live branch not found: %', v_branch; end if;

      v_normalized_name := lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));
      select id into v_company_id
      from public.companies
      where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = v_normalized_name
      order by created_at
      limit 1;
      if v_company_id is null then
        insert into public.companies (name) values (v_name) returning id into v_company_id;
      end if;

      v_industry := nullif(btrim(v_row->>'industry'), '');
      update public.companies
      set industry = coalesce(nullif(industry, ''), v_industry)
      where id = v_company_id;

      select id into v_organization_id
      from public.organizations
      where normalized_name = v_normalized_name and branch_id = v_branch_id
      order by created_at
      limit 1;
      if v_organization_id is null then
        select id into v_organization_id
        from public.organizations
        where normalized_name = v_normalized_name
        order by created_at
        limit 1;
      end if;

      v_rent := nullif(btrim(coalesce(v_row->>'office_rental_zar', '')), '')::numeric;
      v_office_size := nullif(btrim(coalesce(v_row->>'office_size', '')), '')::numeric;
      v_deposit := nullif(btrim(coalesce(v_row->>'deposit_paid_zar', '')), '')::numeric;
      v_desks := nullif(btrim(coalesce(v_row->>'desks', '')), '')::integer;
      v_lease_start := nullif(btrim(coalesce(v_row->>'lease_start_date', '')), '')::date;
      v_lease_end := nullif(btrim(coalesce(v_row->>'rental_end_date', '')), '')::date;
      v_escalation_date := nullif(btrim(coalesce(v_row->>'next_escalation_date', '')), '')::date;
      v_tier := coalesce(nullif(v_row->>'tier', '')::public.subscription_tier, 'private_office');
      if v_rent < 0 or v_office_size < 0 or v_deposit < 0 or v_desks < 0 then
        raise exception 'Rent, deposit, office size, and desk count cannot be negative.';
      end if;

      select id into v_tenant_id
      from public.tenants
      where branch_id = v_branch_id
        and company_id = v_company_id
        and office_number = v_office_number
      limit 1;

      if v_tenant_id is null then
        insert into public.tenants (
          company_id, organization_id, branch_id, tier, desks, mrr_zar, since, status,
          office_number, office_size, office_details, lease_term, rental_end_date,
          next_escalation_date, deposit_paid_zar, primary_contact_name, primary_contact_email,
          boardroom_access, union_station_event_access, source_data
        ) values (
          v_company_id, v_organization_id, v_branch_id, v_tier, v_desks, v_rent, v_lease_start, 'active',
          v_office_number, v_office_size, nullif(btrim(v_row->>'office_details'), ''),
          nullif(btrim(v_row->>'lease_term'), ''), v_lease_end, v_escalation_date, v_deposit,
          nullif(btrim(v_row->>'primary_contact_name'), ''),
          nullif(btrim(v_row->>'primary_contact_email'), ''),
          nullif(btrim(v_row->>'boardroom_access'), ''),
          nullif(btrim(v_row->>'union_station_event_access'), ''),
          coalesce(v_row->'source_data', '{}'::jsonb)
        );
      else
        update public.tenants set
          organization_id = coalesce(v_organization_id, organization_id),
          tier = v_tier,
          desks = coalesce(v_desks, desks),
          mrr_zar = coalesce(v_rent, mrr_zar),
          since = coalesce(v_lease_start, since),
          status = 'active',
          office_size = coalesce(v_office_size, office_size),
          office_details = coalesce(nullif(btrim(v_row->>'office_details'), ''), office_details),
          lease_term = coalesce(nullif(btrim(v_row->>'lease_term'), ''), lease_term),
          rental_end_date = coalesce(v_lease_end, rental_end_date),
          next_escalation_date = coalesce(v_escalation_date, next_escalation_date),
          deposit_paid_zar = coalesce(v_deposit, deposit_paid_zar),
          primary_contact_name = coalesce(nullif(btrim(v_row->>'primary_contact_name'), ''), primary_contact_name),
          primary_contact_email = coalesce(nullif(btrim(v_row->>'primary_contact_email'), ''), primary_contact_email),
          boardroom_access = coalesce(nullif(btrim(v_row->>'boardroom_access'), ''), boardroom_access),
          union_station_event_access = coalesce(nullif(btrim(v_row->>'union_station_event_access'), ''), union_station_event_access),
          source_data = coalesce(v_row->'source_data', source_data)
        where id = v_tenant_id;
      end if;
      v_imported := v_imported + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_index,
        'branch', v_row->>'branch',
        'organization_name', v_row->>'organization_name',
        'office_number', v_row->>'office_number',
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object('imported', v_imported, 'errors', v_errors);
end;
$$;

revoke all on function public.import_client_roster(jsonb) from public, anon, authenticated;
grant execute on function public.import_client_roster(jsonb) to service_role;