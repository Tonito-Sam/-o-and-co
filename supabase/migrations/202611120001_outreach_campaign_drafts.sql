create table if not exists public.outreach_campaign_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  campaign_name text not null default '',
  subject text not null default '',
  body text not null default '',
  template_id text references public.crm_email_templates(id) on delete set null,
  template_values jsonb not null default '{}'::jsonb,
  audience text not null default 'all' check (audience in ('all','kyalami','rosebank')),
  prospect_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);

alter table public.outreach_campaign_drafts enable row level security;

create policy outreach_campaign_drafts_owner_access
  on public.outreach_campaign_drafts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.outreach_campaign_drafts to authenticated;
grant all on public.outreach_campaign_drafts to service_role;
