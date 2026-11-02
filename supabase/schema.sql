-- ════════════════════════════════════════════════════════════════════════════
--  Office & Co WorkspaceOS — Full database schema
--  Paste this into the Supabase SQL editor and run.  Safe to re-run.
--  Author: WorkspaceOS · Group CEO: Anthony Manas
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  create type public.app_role as enum (
    'superadmin','group_ceo','sales_manager','rosebank_sales','branch_manager',
    'community_manager','finance','tenant_admin','member'
  );
exception when duplicate_object then null; end $$;

do $$ begin create type public.branch_status     as enum ('live','planned','exploring','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.lead_stage        as enum ('new_lead','contacted','qualified','tour_scheduled','proposal_sent','negotiation','won','lost'); exception when duplicate_object then null; end $$;
do $$ begin create type public.booking_status    as enum ('held','confirmed','checked_in','cancelled','no_show','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.event_status      as enum ('draft','published','full','cancelled','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_status     as enum ('open','in_progress','resolved','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_priority   as enum ('low','medium','high','urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type public.post_status       as enum ('pending','approved','rejected','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.channel_visibility as enum ('public','restricted','private'); exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_tier as enum ('day_pass','flex','dedicated','private_office','enterprise'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_status    as enum ('draft','sent','paid','overdue','void'); exception when duplicate_object then null; end $$;
do $$ begin create type public.us_status         as enum ('draft','submitted','in_review','quoted','confirmed','invoiced','completed','declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.community_module  as enum ('community','events','marketplace','cafe','content'); exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. UTILITY FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. PROFILES + ROLES (security-definer pattern, no recursive RLS)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique,
  full_name     text,
  avatar_url    text,
  phone         text,
  company       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.user_roles (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      public.app_role not null,
  branch_id uuid,
  unique (user_id, role, branch_id)
);

-- has_role MUST exist before any policy references it.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    or (_role::text = 'group_ceo' and exists (
      select 1 from public.user_roles where user_id = _user_id and role::text = 'superadmin'
    ));
$$;

create or replace function public.is_global_crm_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('superadmin', 'group_admin', 'group_ceo', 'crm_manager', 'sales_manager', 'finance')
  );
$$;
revoke all on function public.is_global_crm_staff(uuid) from public;
grant execute on function public.is_global_crm_staff(uuid) to authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (auth.uid() = id or public.has_role(auth.uid(),'group_ceo'));
create policy profiles_self_update on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists user_roles_self_select on public.user_roles;
drop policy if exists user_roles_admin_select on public.user_roles;
create policy user_roles_self_select  on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy user_roles_admin_select on public.user_roles for select to authenticated using (public.has_role(auth.uid(),'group_ceo'));

-- Auto-create profile + default 'member' role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'member')
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before the WorkspaceOS schema was installed.
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', email, 'Workspace member')
from auth.users
on conflict (id) do update
set email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

-- Per-role community module access (overrides defaults in app)
create table if not exists public.role_module_access (
  id        uuid primary key default gen_random_uuid(),
  role      public.app_role not null,
  module    public.community_module not null,
  enabled   boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (role, module)
);
grant select on public.role_module_access to authenticated;
grant all on public.role_module_access to service_role;
alter table public.role_module_access enable row level security;
drop policy if exists rma_read on public.role_module_access;
drop policy if exists rma_admin_write on public.role_module_access;
create policy rma_read        on public.role_module_access for select to authenticated using (true);
create policy rma_admin_write on public.role_module_access for all   to authenticated using (public.has_role(auth.uid(),'group_ceo')) with check (public.has_role(auth.uid(),'group_ceo'));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. BRANCHES, COMPANIES, TENANTS, EMPLOYEES, MEMBERSHIPS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  city       text,
  region     text,
  kind       text,
  status     public.branch_status not null default 'live',
  capacity   int,
  opened_at  date,
  metadata   jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.branches to anon, authenticated;
grant insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;
drop policy if exists branches_public_read on public.branches;
drop policy if exists branches_admin_write on public.branches;
create policy branches_public_read on public.branches for select using (true);
create policy branches_admin_write on public.branches for all to authenticated using (public.has_role(auth.uid(),'group_ceo')) with check (public.has_role(auth.uid(),'group_ceo'));
create index if not exists idx_branches_status on public.branches(status);
create trigger trg_branches_touch before update on public.branches for each row execute function public.touch_updated_at();

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  domain     text,
  industry   text,
  size_band  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.companies to authenticated;
grant all on public.companies to service_role;
alter table public.companies enable row level security;
drop policy if exists companies_auth_read  on public.companies;
drop policy if exists companies_auth_write on public.companies;
create policy companies_auth_read  on public.companies for select to authenticated using (true);
create policy companies_auth_write on public.companies for all    to authenticated using (public.has_role(auth.uid(),'sales_manager') or public.has_role(auth.uid(),'group_ceo')) with check (true);
create trigger trg_companies_touch before update on public.companies for each row execute function public.touch_updated_at();

create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id  uuid not null references public.branches(id),
  tier       public.subscription_tier not null,
  plan_name  text,
  desks      int default 0,
  mrr_zar    int default 0,
  since      date,
  health     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;
drop policy if exists tenants_auth_read on public.tenants;
drop policy if exists tenants_admin_write on public.tenants;
create policy tenants_auth_read   on public.tenants for select to authenticated using (true);
create policy tenants_admin_write on public.tenants for all to authenticated using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'finance')) with check (true);
create index if not exists idx_tenants_branch on public.tenants(branch_id);
create trigger trg_tenants_touch before update on public.tenants for each row execute function public.touch_updated_at();

create or replace function public.enforce_branch_manager_tenant_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role(auth.uid(), 'branch_manager')
    and not (
      public.has_role(auth.uid(), 'superadmin')
      or public.has_role(auth.uid(), 'group_admin')
      or public.has_role(auth.uid(), 'group_ceo')
      or public.has_role(auth.uid(), 'crm_manager')
      or public.has_role(auth.uid(), 'sales_manager')
      or public.has_role(auth.uid(), 'finance')
    )
    and not exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role = 'branch_manager'
        and branch_id = new.branch_id
    ) then
    raise exception 'Branch Managers can only manage tenant records for their assigned branches.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenants_branch_manager_scope on public.tenants;
create trigger trg_tenants_branch_manager_scope
  before insert or update of branch_id on public.tenants
  for each row execute function public.enforce_branch_manager_tenant_scope();

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  full_name   text not null,
  email       text,
  is_admin    boolean default false,
  created_at  timestamptz not null default now()
);
grant select, insert, update, delete on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
drop policy if exists employees_tenant_admin on public.employees;
create policy employees_tenant_admin on public.employees for all to authenticated using (true) with check (true);

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  branch_id   uuid not null references public.branches(id),
  tier        public.subscription_tier not null,
  active      boolean default true,
  started_at  date default now(),
  ended_at    date
);
grant select, insert, update on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;
drop policy if exists memberships_self on public.memberships;
create policy memberships_self on public.memberships for select to authenticated using (auth.uid() = profile_id or public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'finance'));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. FACILITIES + ROOMS + BOOKINGS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.facilities (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches(id) on delete cascade,
  name       text not null,
  floor      int,
  notes      text
);
grant select, insert, update, delete on public.facilities to authenticated;
grant all on public.facilities to service_role;
alter table public.facilities enable row level security;
drop policy if exists facilities_read on public.facilities;
create policy facilities_read on public.facilities for select to authenticated using (true);

create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid references public.facilities(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete cascade,
  code          text,
  name          text not null,
  floor         int,
  kind          text not null,
  capacity      int not null default 1,
  hourly_zar    int default 0,
  is_active     boolean default true,
  created_at    timestamptz not null default now()
);
grant select on public.rooms to anon, authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant all on public.rooms to service_role;
alter table public.rooms enable row level security;
drop policy if exists rooms_public_read on public.rooms;
drop policy if exists rooms_staff_write on public.rooms;
create policy rooms_public_read on public.rooms for select using (true);
create policy rooms_staff_write on public.rooms for all to authenticated using (public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo')) with check (true);
create index if not exists idx_rooms_branch on public.rooms(branch_id);

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  tenant_id    uuid references public.tenants(id) on delete set null,
  booked_by    uuid references public.profiles(id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       public.booking_status not null default 'confirmed',
  guests       int default 1,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
drop policy if exists bookings_self_or_staff on public.bookings;
drop policy if exists bookings_insert_auth on public.bookings;
create policy bookings_self_or_staff on public.bookings for select to authenticated using (
  booked_by = auth.uid()
  or public.has_role(auth.uid(),'branch_manager')
  or public.has_role(auth.uid(),'group_ceo')
  or public.has_role(auth.uid(),'community_manager')
);
create policy bookings_insert_auth on public.bookings for insert to authenticated with check (booked_by = auth.uid() or public.has_role(auth.uid(),'branch_manager'));
create index if not exists idx_bookings_room_time on public.bookings(room_id, starts_at);
create index if not exists idx_bookings_status on public.bookings(status);
create trigger trg_bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. UNION STATION CORPORATE EVENT WORKFLOW
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.union_station_requests (
  id              uuid primary key default gen_random_uuid(),
  reference       text unique not null default ('US-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*9000)+1000)::text,4,'0')),
  client_company  text not null,
  contact_name    text not null,
  contact_email   text not null,
  contact_phone   text,
  event_type      text not null,
  event_date      date not null,
  starts_time     time not null,
  ends_time       time not null,
  attendees       int not null check (attendees > 0),
  layout          text not null,                 -- Theatre, Banquet, Cabaret, Expo, Classroom
  catering        text not null,                 -- None, Coffee Break, Lunch, Cocktail, Gala Dinner
  av_addons       text[] not null default '{}',
  notes           text,
  status          public.us_status not null default 'submitted',
  estimate_zar    int not null default 0,
  deposit_pct     int not null default 30,
  contract_sent   boolean not null default false,
  contract_signed boolean not null default false,
  submitted_by    uuid references public.profiles(id) on delete set null,
  approver_id     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
grant select, insert, update on public.union_station_requests to authenticated;
grant all on public.union_station_requests to service_role;
alter table public.union_station_requests enable row level security;
drop policy if exists usr_select on public.union_station_requests;
drop policy if exists usr_insert on public.union_station_requests;
drop policy if exists usr_update on public.union_station_requests;
create policy usr_select on public.union_station_requests for select to authenticated using (
  submitted_by = auth.uid()
  or public.has_role(auth.uid(),'sales_manager')
  or public.has_role(auth.uid(),'rosebank_sales')
  or public.has_role(auth.uid(),'group_ceo')
  or public.has_role(auth.uid(),'community_manager')
);
create policy usr_insert on public.union_station_requests for insert to authenticated with check (true);
create policy usr_update on public.union_station_requests for update to authenticated using (
  public.has_role(auth.uid(),'sales_manager')
  or public.has_role(auth.uid(),'group_ceo')
) with check (true);
create index if not exists idx_us_event_date on public.union_station_requests(event_date);
create index if not exists idx_us_status     on public.union_station_requests(status);
create trigger trg_us_touch before update on public.union_station_requests for each row execute function public.touch_updated_at();

create table if not exists public.union_station_approvals (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.union_station_requests(id) on delete cascade,
  actor_id     uuid not null references public.profiles(id),
  from_status  public.us_status,
  to_status    public.us_status not null,
  comment      text,
  created_at   timestamptz not null default now()
);
grant select, insert on public.union_station_approvals to authenticated;
grant all on public.union_station_approvals to service_role;
alter table public.union_station_approvals enable row level security;
drop policy if exists usa_select on public.union_station_approvals;
drop policy if exists usa_insert on public.union_station_approvals;
create policy usa_select on public.union_station_approvals for select to authenticated using (true);
create policy usa_insert on public.union_station_approvals for insert to authenticated with check (actor_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. CRM (leads + deals)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique,
  company_name text not null,
  contact_name text,
  contact_email text,
  source       text,
  stage        public.lead_stage not null default 'new_lead',
  value_zar    int default 0,
  score        int default 0,
  branch_id    uuid references public.branches(id),
  owner_id     uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
drop policy if exists leads_sales on public.leads;
create policy leads_sales on public.leads for all to authenticated using (
  owner_id = auth.uid()
  or public.has_role(auth.uid(),'sales_manager')
  or public.has_role(auth.uid(),'group_ceo')
) with check (true);
create index if not exists idx_leads_stage on public.leads(stage);
create trigger trg_leads_touch before update on public.leads for each row execute function public.touch_updated_at();

create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references public.leads(id) on delete set null,
  company_id   uuid references public.companies(id),
  value_zar    int not null default 0,
  close_date   date,
  stage        public.lead_stage not null default 'negotiation',
  won          boolean,
  created_at   timestamptz not null default now()
);
grant select, insert, update, delete on public.deals to authenticated;
grant all on public.deals to service_role;
alter table public.deals enable row level security;
drop policy if exists deals_sales on public.deals;
create policy deals_sales on public.deals for all to authenticated using (
  public.has_role(auth.uid(),'sales_manager') or public.has_role(auth.uid(),'group_ceo')
) with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. EVENTS + RSVPS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references public.branches(id),
  title        text not null,
  description  text,
  kind         text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  capacity     int default 0,
  status       public.event_status not null default 'published',
  hero_url     text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
drop policy if exists events_public_read on public.events;
drop policy if exists events_staff_write on public.events;
create policy events_public_read on public.events for select using (status = 'published' or auth.role() = 'authenticated');
create policy events_staff_write on public.events for all to authenticated using (
  public.has_role(auth.uid(),'community_manager')
  or public.has_role(auth.uid(),'group_ceo')
  or public.is_platform_admin(auth.uid())
  or public.is_branch_manager(auth.uid(), branch_id)
) with check (
  public.has_role(auth.uid(),'community_manager')
  or public.has_role(auth.uid(),'group_ceo')
  or public.is_platform_admin(auth.uid())
  or public.is_branch_manager(auth.uid(), branch_id)
);
create index if not exists idx_events_starts on public.events(starts_at);
create trigger trg_events_touch before update on public.events for each row execute function public.touch_updated_at();

create table if not exists public.event_rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'attending',
  created_at  timestamptz not null default now(),
  unique (event_id, profile_id)
);
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant all on public.event_rsvps to service_role;
alter table public.event_rsvps enable row level security;
drop policy if exists rsvps_self on public.event_rsvps;
create policy rsvps_self on public.event_rsvps for all to authenticated using (profile_id = auth.uid() or public.has_role(auth.uid(),'community_manager')) with check (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 9. COMMUNITY (posts, reactions, comments)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  branch_id   uuid references public.branches(id),
  kind        text,                              -- Welcome / Hiring / Launch / Announcement
  body        text not null,
  author_name text not null default 'Office & Co member',
  author_role text not null default 'Member',
  attachments jsonb not null default '[]'::jsonb,
  status      public.post_status not null default 'approved',
  approved_by uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
grant select, insert, update on public.community_posts to authenticated;
grant all on public.community_posts to service_role;
alter table public.community_posts enable row level security;
drop policy if exists posts_read_approved on public.community_posts;
drop policy if exists posts_author_full   on public.community_posts;
drop policy if exists posts_mod_full      on public.community_posts;
drop policy if exists posts_author_insert on public.community_posts;
drop policy if exists posts_author_update on public.community_posts;
drop policy if exists posts_author_delete on public.community_posts;
create policy posts_read_approved on public.community_posts for select to authenticated using (status = 'approved' or public.is_global_crm_staff(auth.uid()));
create policy posts_author_insert on public.community_posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'approved');
create policy posts_author_update on public.community_posts for update to authenticated
  using (author_id = auth.uid() and status = 'approved')
  with check (author_id = auth.uid() and status = 'approved');
create policy posts_mod_full      on public.community_posts for all    to authenticated using (public.is_global_crm_staff(auth.uid())) with check (public.is_global_crm_staff(auth.uid()));
grant delete on public.community_posts to authenticated;

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'hate_or_violence', 'sexual_content', 'spam', 'misinformation', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  resolution text check (resolution in ('dismiss', 'warn', 'remove')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
alter table public.community_post_reports enable row level security;
grant select, insert, update on public.community_post_reports to authenticated;
drop policy if exists community_post_reports_read on public.community_post_reports;
drop policy if exists community_post_reports_insert on public.community_post_reports;
drop policy if exists community_post_reports_moderate on public.community_post_reports;
create policy community_post_reports_read on public.community_post_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_global_crm_staff(auth.uid()));
create policy community_post_reports_insert on public.community_post_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.community_posts post
      where post.id = post_id and post.status = 'approved' and post.author_id <> auth.uid()
    )
  );
create policy community_post_reports_moderate on public.community_post_reports for update to authenticated
  using (public.is_global_crm_staff(auth.uid()))
  with check (public.is_global_crm_staff(auth.uid()));

create table if not exists public.community_post_warnings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.community_post_warnings enable row level security;
grant select, insert on public.community_post_warnings to authenticated;
drop policy if exists community_post_warnings_read on public.community_post_warnings;
drop policy if exists community_post_warnings_issue on public.community_post_warnings;
create policy community_post_warnings_read on public.community_post_warnings for select to authenticated
  using (author_id = auth.uid() or public.is_global_crm_staff(auth.uid()));
create policy community_post_warnings_issue on public.community_post_warnings for insert to authenticated
  with check (issued_by = auth.uid() and public.is_global_crm_staff(auth.uid()));

create or replace function public.notify_community_post_warning()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(profile_id, title, body, url)
  values (new.author_id, 'Community post warning', new.reason, '/community');
  return new;
end;
$$;
drop trigger if exists trg_community_post_warning_notification on public.community_post_warnings;
create trigger trg_community_post_warning_notification
  after insert on public.community_post_warnings
  for each row execute function public.notify_community_post_warning();
create trigger trg_posts_touch before update on public.community_posts for each row execute function public.touch_updated_at();

create table if not exists public.post_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null default '❤️',
  unique (post_id, profile_id, emoji)
);
grant select, insert, delete on public.post_reactions to authenticated;
grant all on public.post_reactions to service_role;
alter table public.post_reactions enable row level security;
drop policy if exists reactions_all on public.post_reactions;
create policy reactions_all on public.post_reactions for all to authenticated using (profile_id = auth.uid() or true) with check (profile_id = auth.uid());

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.post_comments to authenticated;
grant all on public.post_comments to service_role;
alter table public.post_comments enable row level security;
drop policy if exists comments_read on public.post_comments;
drop policy if exists comments_own  on public.post_comments;
create policy comments_read on public.post_comments for select to authenticated using (true);
create policy comments_own  on public.post_comments for all    to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 10. CAFÉ + MARKETPLACE + CONTENT
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cafe_orders (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references public.branches(id),
  profile_id  uuid references public.profiles(id),
  item        text not null,
  amount_zar  int default 0,
  method      text,
  status      text default 'queued',
  created_at  timestamptz not null default now()
);
grant select, insert, update on public.cafe_orders to authenticated;
grant all on public.cafe_orders to service_role;
alter table public.cafe_orders enable row level security;
drop policy if exists cafe_self on public.cafe_orders;
create policy cafe_self on public.cafe_orders for all to authenticated using (profile_id = auth.uid() or public.has_role(auth.uid(),'community_manager') or public.has_role(auth.uid(),'branch_manager')) with check (true);

create table if not exists public.marketplace_listings (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid references public.profiles(id),
  seller_name text,
  title      text not null,
  category   text,
  listing_type text not null default 'product',
  price_zar  int default 0,
  description text,
  image_url  text,
  rating     numeric(3,2) default 0,
  is_active  boolean default true,
  created_at timestamptz not null default now()
);
grant select on public.marketplace_listings to anon, authenticated;
grant insert, update, delete on public.marketplace_listings to authenticated;
grant all on public.marketplace_listings to service_role;
alter table public.marketplace_listings enable row level security;
drop policy if exists mk_read on public.marketplace_listings;
drop policy if exists mk_own  on public.marketplace_listings;
create policy mk_read on public.marketplace_listings for select using (is_active or seller_id = auth.uid());
create policy mk_own  on public.marketplace_listings for all to authenticated using (seller_id = auth.uid() or public.has_role(auth.uid(),'community_manager')) with check (seller_id = auth.uid() or public.has_role(auth.uid(),'community_manager'));

create table if not exists public.content_items (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null,
  host       text,
  duration   text,
  plays      int default 0,
  media_url  text,
  published  boolean default true,
  created_at timestamptz not null default now()
);
grant select on public.content_items to anon, authenticated;
grant insert, update, delete on public.content_items to authenticated;
grant all on public.content_items to service_role;
alter table public.content_items enable row level security;
drop policy if exists content_public_read on public.content_items;
create policy content_public_read on public.content_items for select using (published);
drop policy if exists content_staff_write on public.content_items;
create policy content_staff_write on public.content_items for all to authenticated
  using (public.has_role(auth.uid(),'community_manager') or public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'branch_manager'))
  with check (public.has_role(auth.uid(),'community_manager') or public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'branch_manager'));

-- ════════════════════════════════════════════════════════════════════════════
-- 11. SUPPORT
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique,
  branch_id    uuid references public.branches(id),
  tenant_id    uuid references public.tenants(id),
  raised_by    uuid references public.profiles(id),
  assignee_id  uuid references public.profiles(id),
  subject      text not null,
  body         text,
  priority     public.ticket_priority not null default 'medium',
  status       public.ticket_status not null default 'open',
  sla_due_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
grant select, insert, update on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;
alter table public.support_tickets enable row level security;
drop policy if exists tickets_scope on public.support_tickets;
create policy tickets_scope on public.support_tickets for all to authenticated using (
  raised_by = auth.uid() or assignee_id = auth.uid()
  or public.has_role(auth.uid(),'branch_manager') or public.has_role(auth.uid(),'group_ceo')
) with check (true);
create trigger trg_tickets_touch before update on public.support_tickets for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 12. INTERNAL MESSAGING
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.messaging_channels (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  description   text,
  visibility    public.channel_visibility not null default 'restricted',
  allowed_roles public.app_role[] not null default '{}',
  created_by    uuid references public.profiles(id),
  archived      boolean default false,
  created_at    timestamptz not null default now()
);
grant select, insert, update on public.messaging_channels to authenticated;
grant all on public.messaging_channels to service_role;
alter table public.messaging_channels enable row level security;

-- Security-definer helper: can the user see this channel?
create or replace function public.user_can_see_channel(_user_id uuid, _channel uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v public.channel_visibility; allowed public.app_role[]; my_roles public.app_role[];
begin
  select visibility, allowed_roles into v, allowed from public.messaging_channels where id = _channel;
  if v is null then return false; end if;
  if v = 'public' then return true; end if;
  if public.has_role(_user_id,'group_ceo') then return true; end if;
  select array_agg(role) into my_roles from public.user_roles where user_id = _user_id;
  if my_roles is null then return false; end if;
  return exists (select 1 from unnest(my_roles) r where r = any(allowed));
end $$;

drop policy if exists channels_visible    on public.messaging_channels;
drop policy if exists channels_admin_write on public.messaging_channels;
create policy channels_visible     on public.messaging_channels for select to authenticated using (public.user_can_see_channel(auth.uid(), id));
create policy channels_admin_write on public.messaging_channels for all   to authenticated using (public.has_role(auth.uid(),'group_ceo')) with check (public.has_role(auth.uid(),'group_ceo'));

create table if not exists public.channel_members (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.messaging_channels(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  subscribed   boolean not null default true,
  muted        boolean not null default false,
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),
  unique (channel_id, profile_id)
);
grant select, insert, update, delete on public.channel_members to authenticated;
grant all on public.channel_members to service_role;
alter table public.channel_members enable row level security;
drop policy if exists cm_self on public.channel_members;
create policy cm_self on public.channel_members for all to authenticated using (profile_id = auth.uid() or public.has_role(auth.uid(),'group_ceo')) with check (profile_id = auth.uid() or public.has_role(auth.uid(),'group_ceo'));

create table if not exists public.channel_messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.messaging_channels(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.channel_messages to authenticated;
grant all on public.channel_messages to service_role;
alter table public.channel_messages enable row level security;
drop policy if exists msg_visible on public.channel_messages;
drop policy if exists msg_post    on public.channel_messages;
drop policy if exists msg_own     on public.channel_messages;
create policy msg_visible on public.channel_messages for select to authenticated using (public.user_can_see_channel(auth.uid(), channel_id));
create policy msg_post    on public.channel_messages for insert to authenticated with check (author_id = auth.uid() and public.user_can_see_channel(auth.uid(), channel_id));
create policy msg_own     on public.channel_messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create index if not exists idx_msg_channel_time on public.channel_messages(channel_id, created_at desc);

create table if not exists public.message_receipts (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  unique (message_id, profile_id)
);
grant select, insert on public.message_receipts to authenticated;
grant all on public.message_receipts to service_role;
alter table public.message_receipts enable row level security;
drop policy if exists receipts_visible on public.message_receipts;
drop policy if exists receipts_self    on public.message_receipts;
create policy receipts_visible on public.message_receipts for select to authenticated using (
  exists (select 1 from public.channel_messages m where m.id = message_id and public.user_can_see_channel(auth.uid(), m.channel_id))
);
create policy receipts_self on public.message_receipts for insert to authenticated with check (profile_id = auth.uid());

-- Direct messages (1:1 or small group)
create table if not exists public.direct_threads (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create table if not exists public.direct_thread_members (
  thread_id  uuid not null references public.direct_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, profile_id)
);
create table if not exists public.direct_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.direct_threads(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.direct_threads        to authenticated;
grant select, insert, update on public.direct_thread_members to authenticated;
grant select, insert, update on public.direct_messages       to authenticated;
grant all on public.direct_threads, public.direct_thread_members, public.direct_messages to service_role;
alter table public.direct_threads        enable row level security;
alter table public.direct_thread_members enable row level security;
alter table public.direct_messages       enable row level security;

create or replace function public.is_thread_member(_user uuid, _thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.direct_thread_members where thread_id = _thread and profile_id = _user);
$$;

drop policy if exists dt_member  on public.direct_threads;
drop policy if exists dtm_self   on public.direct_thread_members;
drop policy if exists dm_member  on public.direct_messages;
create policy dt_member on public.direct_threads        for select to authenticated using (public.is_thread_member(auth.uid(), id));
create policy dtm_self  on public.direct_thread_members for all    to authenticated using (profile_id = auth.uid() or public.is_thread_member(auth.uid(), thread_id)) with check (profile_id = auth.uid() or public.is_thread_member(auth.uid(), thread_id));
create policy dm_member on public.direct_messages       for all    to authenticated using (public.is_thread_member(auth.uid(), thread_id)) with check (author_id = auth.uid() and public.is_thread_member(auth.uid(), thread_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 13. NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
drop policy if exists notif_self on public.notifications;
create policy notif_self on public.notifications for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 14. BILLING (invoices + payments)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique not null,
  tenant_id    uuid references public.tenants(id),
  union_request_id uuid references public.union_station_requests(id),
  amount_zar   int not null,
  status       public.invoice_status not null default 'sent',
  issued_at    date not null default current_date,
  due_at       date not null,
  paid_at      date,
  metadata     jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
grant select, insert, update on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
drop policy if exists invoices_scope on public.invoices;
create policy invoices_scope on public.invoices for all to authenticated using (
  public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'group_ceo')
) with check (public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'group_ceo'));
create index if not exists idx_invoices_status on public.invoices(status);
create trigger trg_invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_zar int not null,
  method     text,
  paid_at    timestamptz not null default now(),
  reference  text
);
grant select, insert on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
drop policy if exists payments_finance on public.payments;
create policy payments_finance on public.payments for all to authenticated using (
  public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'group_ceo')
) with check (public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'group_ceo'));

-- ════════════════════════════════════════════════════════════════════════════
-- 15. AUDIT LOG
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  diff       jsonb,
  created_at timestamptz not null default now()
);
grant insert on public.audit_log to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
drop policy if exists audit_admin_read on public.audit_log;
drop policy if exists audit_insert     on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.has_role(auth.uid(),'group_ceo'));
create policy audit_insert     on public.audit_log for insert to authenticated with check (actor_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 16. ORGANIZATION WORKSPACES + INVITE-BASED ONBOARDING
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website text,
  industry text,
  team_size integer check (team_size is null or team_size between 1 and 100000),
  branch_id uuid not null references public.branches(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  role text not null check (role in ('admin','member')),
  status text not null default 'active' check (status in ('active','suspended')),
  joined_at timestamptz not null default now()
);
create index if not exists idx_organization_members_org on public.organization_members(organization_id, role, status);

create table if not exists public.organization_invite_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  code_hash bytea not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_organization_invites_org on public.organization_invite_codes(organization_id, created_at desc);

create or replace function public.has_organization_role(_user_id uuid, _organization_id uuid, _role text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.user_id = _user_id and m.organization_id = _organization_id
      and m.status = 'active' and (_role is null or m.role = _role)
  );
$$;

create or replace function public.is_office_co_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = _user_id
      and r.role::text in ('superadmin','group_ceo','sales_manager','rosebank_sales','branch_manager','community_manager','finance')
  );
$$;

create or replace function public.create_organization_for_current_user(
  p_name text, p_website text, p_industry text, p_branch_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then raise exception 'Sign in before creating an organization.'; end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Enter an organization name between 2 and 160 characters.';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'Your account is already associated with an organization.';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'live') then
    raise exception 'Select an active Office & Co branch.';
  end if;

  insert into public.organizations (name, normalized_name, website, industry, branch_id, created_by)
  values (v_name, lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g')),
    nullif(btrim(p_website), ''), nullif(btrim(p_industry), ''), p_branch_id, v_user_id)
  returning id into v_organization_id;

  insert into public.organization_members (user_id, organization_id, branch_id, role)
  values (v_user_id, v_organization_id, p_branch_id, 'admin');
  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_user_id, 'organization', v_organization_id, 'created', jsonb_build_object('name', v_name, 'branch_id', p_branch_id));
  return v_organization_id;
exception
  when unique_violation then
    raise exception 'An organization with this name is already registered. Join it using an invite code.';
end;
$$;

create or replace function public.create_organization_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_branch_id uuid;
  v_code text := upper(encode(gen_random_bytes(16), 'hex'));
begin
  if v_user_id is null then raise exception 'Sign in before creating an invite.'; end if;
  select organization_id, branch_id into v_organization_id, v_branch_id
  from public.organization_members where user_id = v_user_id and role = 'admin' and status = 'active';
  if v_organization_id is null then raise exception 'Only an organization admin can create invite codes.'; end if;
  insert into public.organization_invite_codes (organization_id, branch_id, code_hash, created_by, expires_at)
  values (v_organization_id, v_branch_id, digest(convert_to(v_code, 'UTF8'), 'sha256'), v_user_id, now() + interval '7 days');
  return v_code;
end;
$$;

create or replace function public.accept_organization_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.organization_invite_codes%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in before using an invite code.'; end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'Your account is already associated with an organization.';
  end if;
  select * into v_invite from public.organization_invite_codes
  where code_hash = digest(convert_to(upper(btrim(p_code)), 'UTF8'), 'sha256')
    and consumed_at is null and expires_at > now()
  for update;
  if not found then raise exception 'This invite code is invalid, expired, or already used.'; end if;
  update public.organization_invite_codes set consumed_at = now(), consumed_by = v_user_id where id = v_invite.id;
  insert into public.organization_members (user_id, organization_id, branch_id, role)
  values (v_user_id, v_invite.organization_id, v_invite.branch_id, 'member');
  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_user_id, 'organization', v_invite.organization_id, 'member_joined', jsonb_build_object('invite_id', v_invite.id));
  return v_invite.organization_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invite_codes enable row level security;
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated
  using (public.has_organization_role(auth.uid(), id) or public.is_office_co_staff(auth.uid()));
drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update on public.organizations for update to authenticated
  using (public.has_organization_role(auth.uid(), id, 'admin'))
  with check (public.has_organization_role(auth.uid(), id, 'admin'));
drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.has_organization_role(auth.uid(), organization_id, 'admin') or public.is_office_co_staff(auth.uid()));

grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant all on public.organizations, public.organization_members, public.organization_invite_codes to service_role;
revoke all on table public.organization_invite_codes from anon, authenticated;
revoke all on function public.has_organization_role(uuid, uuid, text) from public;
revoke all on function public.is_office_co_staff(uuid) from public;
revoke all on function public.create_organization_for_current_user(text, text, text, uuid) from public;
revoke all on function public.create_organization_invite() from public;
revoke all on function public.accept_organization_invite(text) from public;
grant execute on function public.create_organization_for_current_user(text, text, text, uuid) to authenticated;
grant execute on function public.create_organization_invite() to authenticated;
grant execute on function public.accept_organization_invite(text) to authenticated;
grant execute on function public.has_organization_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.is_office_co_staff(uuid) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 17. SEED — branches, default channels & module access
-- ════════════════════════════════════════════════════════════════════════════
insert into public.branches (slug, name, city, region, status, kind, capacity, metadata)
values
  ('kyalami',       'Kyalami',                      'Johannesburg', 'Gauteng',       'live',      'Coworking',      280,  '{"sections":["rooms","offices","parking","equipment","feed","events","shop","cafe","marketplace","support"]}'::jsonb),
  ('bryanston',     'Bryanston',                    'Johannesburg', 'Gauteng',       'live',      'Coworking',      340,  '{}'::jsonb),
  ('rosebank',      'Rosebank',                     'Johannesburg', 'Gauteng',       'live',      'Coworking',      220,  '{"sections":["rooms","desks","offices","equipment","feed","events","shop","cafe","marketplace","support"]}'::jsonb),
  ('union-station', 'Union Station',                'Johannesburg', 'Gauteng',       'live',      'Corporate Event Venue', 450, '{}'::jsonb),
  ('sandton',       'Sandton (Coming Soon)',        'Johannesburg', 'Gauteng',       'planned',   'Coworking',      null, '{}'::jsonb),
  ('cpt-waterfront','Cape Town · V&A (Pipeline)',   'Cape Town',    'Western Cape',  'planned',   'Coworking',      null, '{}'::jsonb),
  ('dbn-umhlanga',  'Durban · Umhlanga (Exploring)','Durban',       'KwaZulu-Natal', 'exploring', 'Coworking',      null, '{}'::jsonb)
on conflict (slug) do update
set metadata = coalesce(public.branches.metadata, '{}'::jsonb) || excluded.metadata;

insert into public.messaging_channels (name, description, visibility, allowed_roles) values
  ('exec-board',           'Executive board · audit-logged',                'private',    array['group_ceo','finance']::public.app_role[]),
  ('group-leadership',     'All managers across the group',                 'restricted', array['group_ceo','sales_manager','branch_manager','finance']::public.app_role[]),
  ('finance',              'Finance ops, close cycle, treasury',            'restricted', array['group_ceo','finance']::public.app_role[]),
  ('branch-managers',      'Branch managers',                               'restricted', array['group_ceo','branch_manager']::public.app_role[]),
  ('ops-incident',         'Real-time incident response',                   'restricted', array['group_ceo','branch_manager','community_manager']::public.app_role[]),
  ('union-station-events', 'Corporate event venue approvals',               'restricted', array['group_ceo','sales_manager','rosebank_sales','community_manager']::public.app_role[]),
  ('sales-floor',          'Sales pipeline & hand-offs',                    'restricted', array['group_ceo','sales_manager','rosebank_sales']::public.app_role[]),
  ('announcements',        'Read-only company-wide announcements',          'public',     array['group_ceo','sales_manager','rosebank_sales','branch_manager','community_manager','finance']::public.app_role[])
on conflict (name) do nothing;

-- Default module access (matches client defaults)
insert into public.role_module_access (role, module, enabled) values
  ('group_ceo','community',true),('group_ceo','events',true),('group_ceo','marketplace',true),('group_ceo','cafe',true),('group_ceo','content',true),
  ('sales_manager','community',false),('sales_manager','events',true),('sales_manager','marketplace',false),('sales_manager','cafe',false),('sales_manager','content',true),
  ('rosebank_sales','community',true),('rosebank_sales','events',true),('rosebank_sales','marketplace',false),('rosebank_sales','cafe',false),('rosebank_sales','content',true),
  ('branch_manager','community',true),('branch_manager','events',true),('branch_manager','marketplace',false),('branch_manager','cafe',true),('branch_manager','content',false),
  ('community_manager','community',true),('community_manager','events',true),('community_manager','marketplace',true),('community_manager','cafe',true),('community_manager','content',true),
  ('finance','community',false),('finance','events',false),('finance','marketplace',false),('finance','cafe',false),('finance','content',false),
  ('tenant_admin','community',true),('tenant_admin','events',true),('tenant_admin','marketplace',true),('tenant_admin','cafe',true),('tenant_admin','content',false)
on conflict (role, module) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
--  END OF SCHEMA
-- ════════════════════════════════════════════════════════════════════════════
