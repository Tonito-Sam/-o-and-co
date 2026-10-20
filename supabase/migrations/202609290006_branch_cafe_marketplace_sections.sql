alter table public.branch_sections
  drop constraint if exists branch_sections_section_key_check;

alter table public.branch_sections
  add constraint branch_sections_section_key_check
  check (section_key in ('rooms','desks','offices','parking','equipment','feed','events','shop','cafe','marketplace','support'));

insert into public.branch_sections (branch_id, section_key, sort_order)
select b.id, section.section_key, section.sort_order
from public.branches b
cross join (values
  ('cafe', 9), ('marketplace', 10)
) as section(section_key, sort_order)
where b.slug in ('kyalami','rosebank')
on conflict (branch_id, section_key) do update
set enabled = true, sort_order = excluded.sort_order;
