create or replace function public.can_manage_facility_branch(_user_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _branch_id is not null and (
    public.can_manage_branch(_user_id, _branch_id)
    or public.has_role(_user_id, 'finance')
  );
$$;

revoke all on function public.can_manage_facility_branch(uuid, uuid) from public;
grant execute on function public.can_manage_facility_branch(uuid, uuid) to authenticated, service_role;

create table if not exists public.facility_spaces (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('office', 'meeting_room', 'communal', 'amenity')),
  status text not null default 'shared'
    check (status in ('occupied', 'vacant', 'shared', 'maintenance', 'needs_review')),
  office_number text,
  tenant_id uuid references public.tenants(id) on delete set null,
  source_folder text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code),
  unique (branch_id, source_folder)
);

create index if not exists idx_facility_spaces_branch_status
  on public.facility_spaces(branch_id, status, name);

create or replace function public.enforce_facility_space_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_branch uuid;
begin
  if new.tenant_id is not null then
    select branch_id into v_tenant_branch
    from public.tenants
    where id = new.tenant_id;
    if v_tenant_branch is distinct from new.branch_id then
      raise exception 'The selected tenant does not belong to this facility branch.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_facility_spaces_branch on public.facility_spaces;
create trigger trg_facility_spaces_branch
  before insert or update on public.facility_spaces
  for each row execute function public.enforce_facility_space_branch();

create table if not exists public.facility_space_photos (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  object_path text not null unique,
  source_filename text not null,
  caption text,
  sort_order integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_facility_space_photos_space_order
  on public.facility_space_photos(space_id, sort_order, created_at);

create or replace function public.enforce_facility_space_photo_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_branch uuid;
  v_branch_slug text;
begin
  select branch_id into v_space_branch
  from public.facility_spaces
  where id = new.space_id;
  if v_space_branch is distinct from new.branch_id then
    raise exception 'The photo and space must belong to the same branch.';
  end if;

  select slug into v_branch_slug
  from public.branches
  where id = new.branch_id;
  if split_part(new.object_path, '/', 1) is distinct from v_branch_slug
    or split_part(new.object_path, '/', 2) is distinct from new.space_id::text then
    raise exception 'The photo path must be scoped to its branch and facility space.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_facility_space_photos_scope on public.facility_space_photos;
create trigger trg_facility_space_photos_scope
  before insert or update on public.facility_space_photos
  for each row execute function public.enforce_facility_space_photo_scope();

alter table public.facility_spaces enable row level security;
alter table public.facility_space_photos enable row level security;

drop policy if exists facility_spaces_manage on public.facility_spaces;
create policy facility_spaces_manage on public.facility_spaces
  for all to authenticated
  using (public.can_manage_facility_branch(auth.uid(), branch_id))
  with check (public.can_manage_facility_branch(auth.uid(), branch_id));

drop policy if exists facility_space_photos_manage on public.facility_space_photos;
create policy facility_space_photos_manage on public.facility_space_photos
  for all to authenticated
  using (public.can_manage_facility_branch(auth.uid(), branch_id))
  with check (public.can_manage_facility_branch(auth.uid(), branch_id));

grant select, insert, update, delete on public.facility_spaces, public.facility_space_photos to authenticated;
grant all on public.facility_spaces, public.facility_space_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facility-space-photos',
  'facility-space-photos',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists facility_space_photos_storage_read on storage.objects;
create policy facility_space_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
        and exists (
          select 1 from public.facility_spaces space
          where space.branch_id = branch.id
            and space.id::text = (storage.foldername(name))[2]
        )
    )
  );

drop policy if exists facility_space_photos_storage_insert on storage.objects;
create policy facility_space_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
        and exists (
          select 1 from public.facility_spaces space
          where space.branch_id = branch.id
            and space.id::text = (storage.foldername(name))[2]
        )
    )
  );

drop policy if exists facility_space_photos_storage_update on storage.objects;
create policy facility_space_photos_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
        and exists (
          select 1 from public.facility_spaces space
          where space.branch_id = branch.id
            and space.id::text = (storage.foldername(name))[2]
        )
    )
  )
  with check (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
        and exists (
          select 1 from public.facility_spaces space
          where space.branch_id = branch.id
            and space.id::text = (storage.foldername(name))[2]
        )
    )
  );

drop policy if exists facility_space_photos_storage_delete on storage.objects;
create policy facility_space_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
    )
  );
