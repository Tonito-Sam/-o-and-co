create table if not exists public.facility_space_tour_photos (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  branch_slug text not null,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  space_name text not null,
  office_number text,
  source_photo_id uuid not null unique
    references public.facility_space_photos(id) on delete cascade,
  object_path text not null unique,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_facility_space_tour_photos_branch_space_order
  on public.facility_space_tour_photos(branch_slug, space_id, sort_order, created_at);

create or replace function public.enforce_facility_space_tour_photo_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.facility_spaces%rowtype;
  v_source public.facility_space_photos%rowtype;
  v_branch_slug text;
begin
  select * into v_space
  from public.facility_spaces
  where id = new.space_id;

  if not found or v_space.branch_id is distinct from new.branch_id
    or v_space.category <> 'office' or v_space.status <> 'vacant' then
    raise exception 'Only vacant office photos can be published to the branch tour.';
  end if;

  select * into v_source
  from public.facility_space_photos
  where id = new.source_photo_id;

  if not found or v_source.space_id is distinct from new.space_id
    or v_source.branch_id is distinct from new.branch_id then
    raise exception 'The tour photo must reference an image belonging to this office.';
  end if;

  select slug into v_branch_slug
  from public.branches
  where id = new.branch_id;

  if new.branch_slug is distinct from v_branch_slug
    or split_part(new.object_path, '/', 1) is distinct from v_branch_slug
    or split_part(new.object_path, '/', 2) is distinct from new.space_id::text then
    raise exception 'The tour image path must be scoped to its branch and facility space.';
  end if;

  new.space_name := v_space.name;
  new.office_number := v_space.office_number;
  return new;
end;
$$;

drop trigger if exists trg_facility_space_tour_photo_scope
  on public.facility_space_tour_photos;
create trigger trg_facility_space_tour_photo_scope
  before insert or update on public.facility_space_tour_photos
  for each row execute function public.enforce_facility_space_tour_photo_scope();

create or replace function public.is_public_vacant_facility_office(
  p_space_id uuid,
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.facility_spaces space
    where space.id = p_space_id
      and space.branch_id = p_branch_id
      and space.category = 'office'
      and space.status = 'vacant'
  );
$$;

revoke all on function public.is_public_vacant_facility_office(uuid, uuid) from public;
grant execute on function public.is_public_vacant_facility_office(uuid, uuid)
  to anon, authenticated;

alter table public.facility_space_tour_photos enable row level security;

drop policy if exists facility_space_tour_photos_public_read
  on public.facility_space_tour_photos;
create policy facility_space_tour_photos_public_read
  on public.facility_space_tour_photos
  for select to anon, authenticated
  using (public.is_public_vacant_facility_office(space_id, branch_id));

drop policy if exists facility_space_tour_photos_manage
  on public.facility_space_tour_photos;
create policy facility_space_tour_photos_manage
  on public.facility_space_tour_photos
  for all to authenticated
  using (public.can_manage_facility_branch(auth.uid(), branch_id))
  with check (
    public.can_manage_facility_branch(auth.uid(), branch_id)
    and public.is_public_vacant_facility_office(space_id, branch_id)
  );

grant select on public.facility_space_tour_photos to anon, authenticated;
grant insert, update, delete on public.facility_space_tour_photos to authenticated;
grant all on public.facility_space_tour_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facility-vacant-tour-photos',
  'facility-vacant-tour-photos',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists facility_vacant_tour_photos_storage_insert on storage.objects;
create policy facility_vacant_tour_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    storage.objects.bucket_id = 'facility-vacant-tour-photos'
    and exists (
      select 1
      from public.branches branch
      join public.facility_spaces space
        on space.branch_id = branch.id
       and space.id::text = (storage.foldername(storage.objects.name))[2]
      where branch.slug = (storage.foldername(storage.objects.name))[1]
        and space.category = 'office'
        and space.status = 'vacant'
        and public.can_manage_facility_branch(auth.uid(), branch.id)
    )
  );

drop policy if exists facility_vacant_tour_photos_storage_delete on storage.objects;
create policy facility_vacant_tour_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    storage.objects.bucket_id = 'facility-vacant-tour-photos'
    and exists (
      select 1
      from public.branches branch
      where branch.slug = (storage.foldername(storage.objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), branch.id)
    )
  );

create or replace function public.mark_facility_space_vacant(
  p_space_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.facility_spaces%rowtype;
begin
  select * into v_space
  from public.facility_spaces
  where id = p_space_id
  for update;

  if not found then
    raise exception 'Facility space not found.';
  end if;
  if not public.can_manage_facility_branch(auth.uid(), v_space.branch_id) then
    raise exception 'You do not have permission to update this facility space.';
  end if;
  if v_space.status <> 'occupied' then
    raise exception 'Only an occupied space can be marked vacant.';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Space name cannot be empty.';
  end if;

  if v_space.tenant_id is not null then
    update public.tenants
    set status = 'ended'
    where id = v_space.tenant_id
      and branch_id = v_space.branch_id
      and status = 'active';
  end if;

  update public.facility_spaces
  set name = btrim(p_name),
      status = 'vacant',
      tenant_id = null
  where id = p_space_id;
end;
$$;

revoke all on function public.mark_facility_space_vacant(uuid, text) from public, anon;
grant execute on function public.mark_facility_space_vacant(uuid, text) to authenticated;
