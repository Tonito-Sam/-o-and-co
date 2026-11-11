alter table public.prospect_jobs
  add column if not exists records_skipped integer not null default 0,
  add column if not exists activity jsonb not null default '{"candidates":[]}'::jsonb;

create table if not exists public.prospect_crawl_candidates (
  provider_id text primary key,
  company_key text not null unique,
  website_domain text,
  job_id uuid not null references public.prospect_jobs(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  prospect_id uuid references public.prospect_profiles(id) on delete set null,
  company_name text not null,
  source_url text not null,
  status text not null default 'claimed' check (status in ('claimed', 'created', 'failed')),
  error_summary text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists idx_prospect_crawl_candidates_domain
  on public.prospect_crawl_candidates(website_domain)
  where website_domain is not null;

alter table public.prospect_crawl_candidates enable row level security;
grant all on public.prospect_crawl_candidates to service_role;