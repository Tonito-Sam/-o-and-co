create table if not exists public.sage_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment = 'sandbox'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sage_oauth_states_expiry_idx
  on public.sage_oauth_states (expires_at);

create table if not exists public.sage_oauth_connections (
  environment text primary key check (environment = 'sandbox'),
  connected_by uuid references auth.users(id) on delete set null,
  access_token text not null,
  token_type text not null,
  scope text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.sage_oauth_states enable row level security;
alter table public.sage_oauth_connections enable row level security;

revoke all on public.sage_oauth_states from public, anon, authenticated;
revoke all on public.sage_oauth_connections from public, anon, authenticated;
grant all on public.sage_oauth_states to service_role;
grant all on public.sage_oauth_connections to service_role;
