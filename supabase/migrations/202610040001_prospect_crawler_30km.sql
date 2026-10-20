alter table public.prospect_branch_targets
  add column if not exists branch_address text,
  add column if not exists geocode_label text;

alter table public.prospect_branch_targets
  alter column radius_km set default 30;

update public.prospect_branch_targets
set radius_km = 30
where radius_km <> 30;

alter table public.prospect_branch_targets
  drop constraint if exists prospect_branch_targets_radius_km_check;

alter table public.prospect_branch_targets
  add constraint prospect_branch_targets_radius_km_check check (radius_km = 30);