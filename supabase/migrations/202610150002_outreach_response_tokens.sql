create table if not exists public.outreach_response_tokens (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.outreach_deliveries(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  response text check (response in ('yes','no')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_response_tokens_expiry
  on public.outreach_response_tokens(expires_at) where used_at is null;

alter table public.outreach_response_tokens enable row level security;
grant all on public.outreach_response_tokens to service_role;