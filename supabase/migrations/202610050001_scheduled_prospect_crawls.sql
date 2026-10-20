create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_scheduled_prospect_crawl()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  project_url text;
  anon_key text;
  cron_secret text;
  target record;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'workspaceos_supabase_url';

  select decrypted_secret into anon_key
  from vault.decrypted_secrets
  where name = 'workspaceos_anon_key';

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'workspaceos_crawler_cron_secret';

  if project_url is null or anon_key is null or cron_secret is null then
    raise exception 'Crawler schedule secrets are not configured.';
  end if;

  select target_row.branch_id
  into target
  from public.prospect_branch_targets target_row
  where target_row.enabled
    and target_row.radius_km = 30
    and target_row.branch_address is not null
    and not exists (
      select 1
      from public.prospect_jobs job
      where job.branch_id = target_row.branch_id
        and job.created_at > now() - interval '20 hours'
    )
  order by target_row.updated_at asc
  limit 1;

  if target.branch_id is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/crawl-prospects',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'x-crawler-secret', cron_secret
    ),
    body := jsonb_build_object(
      'action', 'scheduled',
      'branch_id', target.branch_id
    )::text,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.trigger_scheduled_prospect_crawl() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'workspaceos-daily-prospect-crawl';

select cron.schedule(
  'workspaceos-daily-prospect-crawl',
  '0 */6 * * *',
  'select public.trigger_scheduled_prospect_crawl();'
);