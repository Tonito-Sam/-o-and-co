create table if not exists public.prospect_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  company_name text not null,
  normalized_name text not null,
  website_url text,
  website_domain text,
  industry text,
  company_description text,
  address text,
  city text,
  region text,
  country text,
  latitude double precision,
  longitude double precision,
  discovery_status text not null default 'discovered'
    check (discovery_status in ('discovered','enriching','qualified','needs_review','converted','archived','failed')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  score_breakdown jsonb not null default '[]'::jsonb,
  intelligence_summary text,
  intelligence_assessment jsonb not null default '{}'::jsonb,
  recommended_branch_id uuid references public.branches(id) on delete set null,
  discovered_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  crawler_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prospect_profiles_status_discovered
  on public.prospect_profiles(discovery_status, discovered_at desc);
create index if not exists idx_prospect_profiles_domain
  on public.prospect_profiles(website_domain) where website_domain is not null;
create index if not exists idx_prospect_profiles_city_industry
  on public.prospect_profiles(city, industry);
create index if not exists idx_prospect_profiles_score
  on public.prospect_profiles(opportunity_score desc);

create table if not exists public.prospect_sources (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospect_profiles(id) on delete cascade,
  source_type text not null check (source_type in ('discovery_provider','company_website','company_social','business_directory','manual')),
  source_url text not null,
  page_title text,
  content_hash text,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (prospect_id, source_url)
);
create index if not exists idx_prospect_sources_prospect on public.prospect_sources(prospect_id, observed_at desc);

create table if not exists public.prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospect_profiles(id) on delete cascade,
  kind text not null check (kind in ('email','phone','social','contact_page','live_chat')),
  value text not null,
  label text,
  source_id uuid references public.prospect_sources(id) on delete set null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (prospect_id, kind, value)
);
create index if not exists idx_prospect_contacts_prospect on public.prospect_contacts(prospect_id, kind);

create table if not exists public.prospect_signals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospect_profiles(id) on delete cascade,
  category text not null check (category in ('hiring','expansion','events','growth','other')),
  title text not null,
  summary text not null,
  evidence_excerpt text,
  source_id uuid references public.prospect_sources(id) on delete set null,
  source_published_at timestamptz,
  confidence numeric(4,3) check (confidence between 0 and 1),
  detected_at timestamptz not null default now(),
  assessment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_signals_prospect on public.prospect_signals(prospect_id, detected_at desc);
create index if not exists idx_prospect_signals_category on public.prospect_signals(category, detected_at desc);

create table if not exists public.prospect_reviews (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospect_profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('approved','rejected','archived','further_review','assigned','converted','note_added')),
  assigned_to uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_reviews_prospect on public.prospect_reviews(prospect_id, created_at desc);

create table if not exists public.prospect_branch_targets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references public.branches(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_km numeric(6,2) not null default 25 check (radius_km > 0 and radius_km <= 100),
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  connector text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed','cancelled')),
  cursor jsonb not null default '{}'::jsonb,
  records_seen integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  error_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_jobs_status on public.prospect_jobs(status, created_at desc);

alter table public.leads
  add column if not exists prospect_profile_id uuid unique references public.prospect_profiles(id) on delete set null,
  add column if not exists company_website text,
  add column if not exists contact_phone text,
  add column if not exists intelligence_summary text,
  add column if not exists intelligence_metadata jsonb not null default '{}'::jsonb;

create or replace function public.touch_prospect_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_prospect_profiles_touch on public.prospect_profiles;
create trigger trg_prospect_profiles_touch before update on public.prospect_profiles
  for each row execute function public.touch_prospect_updated_at();

alter table public.prospect_profiles enable row level security;
alter table public.prospect_sources enable row level security;
alter table public.prospect_contacts enable row level security;
alter table public.prospect_signals enable row level security;
alter table public.prospect_reviews enable row level security;
alter table public.prospect_branch_targets enable row level security;
alter table public.prospect_jobs enable row level security;

create policy prospect_profiles_sales_read on public.prospect_profiles for select to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));
create policy prospect_sources_sales_read on public.prospect_sources for select to authenticated
  using (exists (select 1 from public.prospect_profiles p where p.id = prospect_id));
create policy prospect_contacts_sales_read on public.prospect_contacts for select to authenticated
  using (exists (select 1 from public.prospect_profiles p where p.id = prospect_id));
create policy prospect_signals_sales_read on public.prospect_signals for select to authenticated
  using (exists (select 1 from public.prospect_profiles p where p.id = prospect_id));
create policy prospect_reviews_sales_read on public.prospect_reviews for select to authenticated
  using (exists (select 1 from public.prospect_profiles p where p.id = prospect_id));
create policy prospect_reviews_manager_write on public.prospect_reviews for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'))
  );
create policy prospect_targets_manager_read on public.prospect_branch_targets for select to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));
create policy prospect_targets_admin_write on public.prospect_branch_targets for all to authenticated
  using (public.has_role(auth.uid(),'group_ceo'))
  with check (public.has_role(auth.uid(),'group_ceo'));
create policy prospect_jobs_sales_read on public.prospect_jobs for select to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));

grant select on public.prospect_profiles, public.prospect_sources, public.prospect_contacts,
  public.prospect_signals, public.prospect_reviews, public.prospect_branch_targets, public.prospect_jobs to authenticated;
grant insert on public.prospect_reviews to authenticated;
grant all on public.prospect_profiles, public.prospect_sources, public.prospect_contacts,
  public.prospect_signals, public.prospect_reviews, public.prospect_branch_targets,
  public.prospect_jobs to service_role;
grant select, insert, update on public.leads to authenticated;
grant all on public.leads to service_role;