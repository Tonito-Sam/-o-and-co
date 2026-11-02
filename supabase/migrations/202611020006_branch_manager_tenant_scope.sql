create or replace function public.enforce_branch_manager_tenant_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role(auth.uid(), 'branch_manager')
    and not (
      public.has_role(auth.uid(), 'superadmin')
      or public.has_role(auth.uid(), 'group_admin')
      or public.has_role(auth.uid(), 'group_ceo')
      or public.has_role(auth.uid(), 'crm_manager')
      or public.has_role(auth.uid(), 'sales_manager')
      or public.has_role(auth.uid(), 'finance')
    )
    and not exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role = 'branch_manager'
        and branch_id = new.branch_id
    ) then
    raise exception 'Branch Managers can only manage tenant records for their assigned branches.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenants_branch_manager_scope on public.tenants;
create trigger trg_tenants_branch_manager_scope
  before insert or update of branch_id on public.tenants
  for each row execute function public.enforce_branch_manager_tenant_scope();