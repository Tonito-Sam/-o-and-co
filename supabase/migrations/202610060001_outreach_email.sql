create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  template text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.outreach_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.outreach_campaigns(id) on delete cascade,
  prospect_id uuid references public.prospect_profiles(id) on delete set null,
  recipient_email text not null,
  company_name text,
  callback_preference text not null default 'unspecified' check (callback_preference in ('yes','no','unspecified')),
  consent_status text not null default 'requires_confirmation' check (consent_status in ('explicitly_opted_in','requires_confirmation','not_requested')),
  provider_message_id text,
  subject text not null,
  template_version text not null default 'v1',
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','replied','bounced','failed','unsubscribed')),
  opened_at timestamptz,
  replied_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_outreach_deliveries_campaign on public.outreach_deliveries(campaign_id, created_at desc);
create index if not exists idx_outreach_deliveries_status on public.outreach_deliveries(status, created_at desc);
create index if not exists idx_outreach_deliveries_recip on public.outreach_deliveries(recipient_email, created_at desc);

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_deliveries enable row level security;

create policy outreach_campaigns_sales_read on public.outreach_campaigns for select to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));
create policy outreach_deliveries_sales_read on public.outreach_deliveries for select to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));
create policy outreach_campaigns_admin_write on public.outreach_campaigns for all to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'))
  with check (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));
create policy outreach_deliveries_admin_write on public.outreach_deliveries for all to authenticated
  using (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'))
  with check (public.has_role(auth.uid(),'group_ceo') or public.has_role(auth.uid(),'sales_manager'));

grant select on public.outreach_campaigns, public.outreach_deliveries to authenticated;
grant all on public.outreach_campaigns, public.outreach_deliveries to service_role;
