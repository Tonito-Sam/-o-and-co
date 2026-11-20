drop policy if exists facility_space_photos_storage_read on storage.objects;
create policy facility_space_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches facility_branch
      where facility_branch.slug = (storage.foldername(objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), facility_branch.id)
        and exists (
          select 1
          from public.facility_spaces facility_space
          where facility_space.branch_id = facility_branch.id
            and facility_space.id::text = (storage.foldername(objects.name))[2]
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
      from public.branches facility_branch
      where facility_branch.slug = (storage.foldername(objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), facility_branch.id)
        and exists (
          select 1
          from public.facility_spaces facility_space
          where facility_space.branch_id = facility_branch.id
            and facility_space.id::text = (storage.foldername(objects.name))[2]
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
      from public.branches facility_branch
      where facility_branch.slug = (storage.foldername(objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), facility_branch.id)
        and exists (
          select 1
          from public.facility_spaces facility_space
          where facility_space.branch_id = facility_branch.id
            and facility_space.id::text = (storage.foldername(objects.name))[2]
        )
    )
  )
  with check (
    bucket_id = 'facility-space-photos'
    and exists (
      select 1
      from public.branches facility_branch
      where facility_branch.slug = (storage.foldername(objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), facility_branch.id)
        and exists (
          select 1
          from public.facility_spaces facility_space
          where facility_space.branch_id = facility_branch.id
            and facility_space.id::text = (storage.foldername(objects.name))[2]
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
      from public.branches facility_branch
      where facility_branch.slug = (storage.foldername(objects.name))[1]
        and public.can_manage_facility_branch(auth.uid(), facility_branch.id)
        and exists (
          select 1
          from public.facility_spaces facility_space
          where facility_space.branch_id = facility_branch.id
            and facility_space.id::text = (storage.foldername(objects.name))[2]
        )
    )
  );
