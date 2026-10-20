alter table public.invoices
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
create index if not exists idx_invoices_organization on public.invoices(organization_id, issued_at desc)
  where organization_id is not null;

drop policy if exists invoices_organization_read on public.invoices;
create policy invoices_organization_read on public.invoices for select to authenticated
  using (
    organization_id is not null
    and public.has_organization_role(auth.uid(), organization_id)
  );

drop policy if exists payments_organization_read on public.payments;
create policy payments_organization_read on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.organization_id is not null
        and public.has_organization_role(auth.uid(), i.organization_id)
    )
  );
