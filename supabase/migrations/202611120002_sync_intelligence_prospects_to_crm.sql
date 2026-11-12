create or replace function public.sync_prospect_profile_to_lead(p_prospect_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prospect public.prospect_profiles%rowtype;
begin
  select *
  into prospect
  from public.prospect_profiles
  where id = p_prospect_profile_id;

  if not found then
    return;
  end if;

  insert into public.leads as lead (
    company_name,
    source,
    stage,
    value_zar,
    score,
    branch_id,
    sales_stage,
    prospect_profile_id,
    company_website,
    intelligence_summary,
    intelligence_metadata
  )
  values (
    prospect.company_name,
    'Prospect Intelligence',
    'new_lead',
    0,
    prospect.opportunity_score,
    prospect.recommended_branch_id,
    'New Lead',
    prospect.id,
    prospect.website_url,
    prospect.intelligence_summary,
    jsonb_build_object(
      'website_domain', prospect.website_domain,
      'industry', prospect.industry,
      'address', prospect.address,
      'city', prospect.city,
      'region', prospect.region,
      'country', prospect.country,
      'discovery_status', prospect.discovery_status,
      'opportunity_score', prospect.opportunity_score,
      'score_breakdown', prospect.score_breakdown,
      'intelligence_assessment', prospect.intelligence_assessment
    )
  )
  on conflict (prospect_profile_id) do update
  set
    company_name = excluded.company_name,
    branch_id = coalesce(excluded.branch_id, lead.branch_id),
    score = excluded.score,
    company_website = coalesce(excluded.company_website, lead.company_website),
    intelligence_summary = coalesce(excluded.intelligence_summary, lead.intelligence_summary),
    intelligence_metadata = coalesce(lead.intelligence_metadata, '{}'::jsonb) || excluded.intelligence_metadata,
    updated_at = now();
end;
$$;

create or replace function public.sync_prospect_profile_to_lead_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_prospect_profile_to_lead(new.id);
  return new;
end;
$$;

create or replace function public.sync_prospect_contacts_to_lead(p_prospect_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leads lead
  set
    contact_email = (
      select contact.value
      from public.prospect_contacts contact
      where contact.prospect_id = p_prospect_profile_id
        and contact.kind = 'email'
      order by contact.first_seen_at, contact.id
      limit 1
    ),
    contact_phone = (
      select contact.value
      from public.prospect_contacts contact
      where contact.prospect_id = p_prospect_profile_id
        and contact.kind = 'phone'
      order by contact.first_seen_at, contact.id
      limit 1
    ),
    updated_at = now()
  where lead.prospect_profile_id = p_prospect_profile_id;
end;
$$;

create or replace function public.sync_prospect_contacts_to_lead_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_prospect_contacts_to_lead(new.prospect_id);
  elsif tg_op = 'DELETE' then
    perform public.sync_prospect_contacts_to_lead(old.prospect_id);
  else
    perform public.sync_prospect_contacts_to_lead(old.prospect_id);
    if new.prospect_id is distinct from old.prospect_id then
      perform public.sync_prospect_contacts_to_lead(new.prospect_id);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.sync_prospect_profile_to_lead(uuid) from public, anon, authenticated;
revoke all on function public.sync_prospect_profile_to_lead_trigger() from public, anon, authenticated;
revoke all on function public.sync_prospect_contacts_to_lead(uuid) from public, anon, authenticated;
revoke all on function public.sync_prospect_contacts_to_lead_trigger() from public, anon, authenticated;
grant execute on function public.sync_prospect_profile_to_lead(uuid) to service_role;
grant execute on function public.sync_prospect_profile_to_lead_trigger() to service_role;
grant execute on function public.sync_prospect_contacts_to_lead(uuid) to service_role;
grant execute on function public.sync_prospect_contacts_to_lead_trigger() to service_role;

drop trigger if exists trg_prospect_profiles_sync_lead on public.prospect_profiles;
create trigger trg_prospect_profiles_sync_lead
  after insert or update on public.prospect_profiles
  for each row execute function public.sync_prospect_profile_to_lead_trigger();

drop trigger if exists trg_prospect_contacts_sync_lead on public.prospect_contacts;
create trigger trg_prospect_contacts_sync_lead
  after insert or update or delete on public.prospect_contacts
  for each row execute function public.sync_prospect_contacts_to_lead_trigger();

do $$
declare
  prospect_id uuid;
begin
  for prospect_id in select id from public.prospect_profiles loop
    perform public.sync_prospect_profile_to_lead(prospect_id);
    perform public.sync_prospect_contacts_to_lead(prospect_id);
  end loop;
end;
$$;
