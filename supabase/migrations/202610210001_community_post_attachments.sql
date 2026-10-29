alter table public.community_posts
  add column if not exists author_name text not null default 'Office & Co member',
  add column if not exists author_role text not null default 'Member',
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.community_posts alter column status set default 'approved';
update public.community_posts set status = 'approved' where status = 'pending';
grant delete on public.community_posts to authenticated;

drop policy if exists posts_read_approved on public.community_posts;
create policy posts_read_approved on public.community_posts for select to authenticated
  using (status = 'approved' or public.is_global_crm_staff(auth.uid()));

drop policy if exists posts_author_full on public.community_posts;
drop policy if exists posts_author_insert on public.community_posts;
drop policy if exists posts_author_update on public.community_posts;
drop policy if exists posts_author_delete on public.community_posts;
create policy posts_author_insert on public.community_posts for insert to authenticated
  with check (author_id = auth.uid() and status = 'approved');
create policy posts_author_update on public.community_posts for update to authenticated
  using (author_id = auth.uid() and status = 'approved')
  with check (author_id = auth.uid() and status = 'approved');

drop policy if exists posts_mod_full on public.community_posts;
create policy posts_mod_full on public.community_posts for all to authenticated
  using (public.is_global_crm_staff(auth.uid()))
  with check (public.is_global_crm_staff(auth.uid()));

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
alter table public.community_post_reports
  add column if not exists resolution text check (resolution in ('dismiss', 'warn', 'remove'));
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

insert into storage.buckets (id, name, public, file_size_limit)
values ('community-post-attachments', 'community-post-attachments', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists community_post_attachments_read on storage.objects;
create policy community_post_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-post-attachments'
    and exists (
      select 1 from public.community_posts post
      where post.id::text = (storage.foldername(name))[1]
        and (
          post.status = 'approved'
          or public.is_global_crm_staff(auth.uid())
        )
    )
  );

drop policy if exists community_post_attachments_insert on storage.objects;
create policy community_post_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-post-attachments'
    and exists (
      select 1 from public.community_posts post
      where post.id::text = (storage.foldername(name))[1]
        and (post.author_id = auth.uid() or public.is_global_crm_staff(auth.uid()))
    )
  );

drop policy if exists community_post_attachments_delete on storage.objects;
create policy community_post_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-post-attachments'
    and exists (
      select 1 from public.community_posts post
      where post.id::text = (storage.foldername(name))[1]
        and post.author_id = auth.uid()
    )
  );

drop policy if exists reactions_all on public.post_reactions;
drop policy if exists post_reactions_read on public.post_reactions;
drop policy if exists post_reactions_insert_own on public.post_reactions;
drop policy if exists post_reactions_delete_own on public.post_reactions;
create policy post_reactions_read on public.post_reactions
  for select to authenticated using (true);
create policy post_reactions_insert_own on public.post_reactions
  for insert to authenticated with check (profile_id = auth.uid());
create policy post_reactions_delete_own on public.post_reactions
  for delete to authenticated using (profile_id = auth.uid());