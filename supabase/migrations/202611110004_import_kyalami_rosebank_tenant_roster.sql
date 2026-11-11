alter table public.tenants
  alter column mrr_zar type numeric(12, 2) using mrr_zar::numeric(12, 2),
  add column if not exists office_number text,
  add column if not exists office_size numeric(10, 2),
  add column if not exists office_details text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists boardroom_access text,
  add column if not exists union_station_event_access text;

create unique index if not exists idx_tenants_branch_office_number
  on public.tenants(branch_id, office_number)
  where office_number is not null;

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
  v_desks integer;
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
      v_desks := nullif(btrim(coalesce(v_row->>'desks', '')), '')::integer;
      if v_rent < 0 or v_office_size < 0 or v_desks < 0 then
        raise exception 'Rent, office size, and desk count cannot be negative.';
      end if;

      select id into v_tenant_id
      from public.tenants
      where branch_id = v_branch_id and office_number = v_office_number
      limit 1;

      if v_tenant_id is null then
        insert into public.tenants (
          company_id, organization_id, branch_id, tier, desks, mrr_zar, status,
          office_number, office_size, office_details, primary_contact_name,
          primary_contact_email, boardroom_access, union_station_event_access
        ) values (
          v_company_id, v_organization_id, v_branch_id, 'private_office', v_desks, v_rent, 'active',
          v_office_number, v_office_size, nullif(btrim(v_row->>'office_details'), ''),
          nullif(btrim(v_row->>'primary_contact_name'), ''),
          nullif(btrim(v_row->>'primary_contact_email'), ''),
          nullif(btrim(v_row->>'boardroom_access'), ''),
          nullif(btrim(v_row->>'union_station_event_access'), '')
        );
      else
        update public.tenants set
          company_id = v_company_id,
          organization_id = coalesce(v_organization_id, organization_id),
          tier = 'private_office',
          desks = coalesce(v_desks, desks),
          mrr_zar = coalesce(v_rent, mrr_zar),
          status = 'active',
          office_size = coalesce(v_office_size, office_size),
          office_details = coalesce(nullif(btrim(v_row->>'office_details'), ''), office_details),
          primary_contact_name = coalesce(nullif(btrim(v_row->>'primary_contact_name'), ''), primary_contact_name),
          primary_contact_email = coalesce(nullif(btrim(v_row->>'primary_contact_email'), ''), primary_contact_email),
          boardroom_access = coalesce(nullif(btrim(v_row->>'boardroom_access'), ''), boardroom_access),
          union_station_event_access = coalesce(nullif(btrim(v_row->>'union_station_event_access'), ''), union_station_event_access)
        where id = v_tenant_id;
      end if;
      v_imported := v_imported + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_index,
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