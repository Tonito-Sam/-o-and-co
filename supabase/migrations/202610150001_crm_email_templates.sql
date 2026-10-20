create table if not exists public.crm_email_templates (
  id text primary key,
  name text not null,
  trigger_label text not null,
  description text not null default '',
  subject text not null,
  body text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_email_templates enable row level security;

create policy crm_email_templates_sales_read on public.crm_email_templates
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'superadmin')
  );

create policy crm_email_templates_sales_update on public.crm_email_templates
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'superadmin')
  )
  with check (
    public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'superadmin')
  );

grant select, update on public.crm_email_templates to authenticated;
grant all on public.crm_email_templates to service_role;

insert into public.crm_email_templates (
  id, name, trigger_label, description, subject, body, enabled, sort_order
) values
  (
    'discovery_intro',
    'Discovery introduction',
    'New eligible prospect discovered',
    'First introduction with live matching space availability.',
    'Workspace options for {{company_name}} in {{branch_name}}',
    $body$Hi {{contact_name}},

I’m reaching out from Office & Co. We help businesses find flexible workspace in {{branch_name}}.

Based on your location, these spaces are currently available:
{{available_spaces}}

Availability checked: {{availability_checked_at}}. Availability may change and is not held until confirmed.

Would you be open to a short conversation or a viewing?

Regards,
Office & Co$body$,
    true,
    10
  ),
  (
    'reply_follow_up',
    'Response follow-up',
    'Prospect replies',
    'Continue the conversation after a prospect responds to the discovery email.',
    'Re: workspace options for {{company_name}}',
    $body$Hi {{contact_name}},

Thank you for getting back to us. {{reply_summary}}

Here are the current options that may fit:
{{available_spaces}}

Would you prefer to arrange a viewing or discuss your requirements first?

Regards,
Office & Co$body$,
    true,
    20
  ),
  (
    'tour_confirmation',
    'Tour confirmation',
    'Tour is booked',
    'Confirm the agreed viewing time and branch location.',
    'Your Office & Co viewing is confirmed',
    $body$Hi {{contact_name}},

Your Office & Co viewing is confirmed for {{tour_date}} at {{tour_time}}.

Location: {{tour_location}}
Branch: {{branch_name}}

Please reply to this email if you need to change the time.

We look forward to meeting you.

Regards,
Office & Co$body$,
    true,
    30
  ),
  (
    'tour_reminder',
    'Tour reminder',
    'Before a booked tour',
    'Remind the prospect about an upcoming viewing.',
    'Reminder: your Office & Co viewing',
    $body$Hi {{contact_name}},

This is a reminder of your Office & Co viewing on {{tour_date}} at {{tour_time}}.

Location: {{tour_location}}

Reply here if you need any assistance or would like to reschedule.

Regards,
Office & Co$body$,
    true,
    40
  ),
  (
    'post_tour_proposal',
    'Post-tour options',
    'After a completed tour',
    'Share the discussed options and proposal after the viewing.',
    'Workspace options following your Office & Co viewing',
    $body$Hi {{contact_name}},

Thank you for visiting Office & Co. Based on our conversation, here are the options we discussed:
{{available_spaces}}

Your proposal is available here: {{proposal_link}}

Please reply with any questions or changes you would like us to consider.

Regards,
Office & Co$body$,
    true,
    50
  ),
  (
    'onboarding_welcome',
    'Tenant welcome',
    'Agreement completed',
    'Welcome a new tenant and direct them to onboarding.',
    'Welcome to Office & Co, {{company_name}}',
    $body$Hi {{contact_name}},

Welcome to Office & Co. We’re pleased to have {{company_name}} joining us at {{branch_name}}.

Get started with your onboarding here: {{onboarding_link}}

Your Office & Co team is ready to help. Please reply to this email if you need anything.

Regards,
Office & Co$body$,
    true,
    60
  )
on conflict (id) do nothing;