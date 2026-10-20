drop policy if exists prospect_profiles_sales_read on public.prospect_profiles;
create policy prospect_profiles_sales_read on public.prospect_profiles for select to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists prospect_reviews_manager_write on public.prospect_reviews;
create policy prospect_reviews_manager_write on public.prospect_reviews for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      public.has_role(auth.uid(), 'group_ceo')
      or public.has_role(auth.uid(), 'sales_manager')
      or public.has_role(auth.uid(), 'crm_manager')
    )
  );

drop policy if exists prospect_targets_manager_read on public.prospect_branch_targets;
create policy prospect_targets_manager_read on public.prospect_branch_targets for select to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists prospect_jobs_sales_read on public.prospect_jobs;
create policy prospect_jobs_sales_read on public.prospect_jobs for select to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists outreach_campaigns_sales_read on public.outreach_campaigns;
create policy outreach_campaigns_sales_read on public.outreach_campaigns for select to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists outreach_deliveries_sales_read on public.outreach_deliveries;
create policy outreach_deliveries_sales_read on public.outreach_deliveries for select to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists outreach_campaigns_admin_write on public.outreach_campaigns;
create policy outreach_campaigns_admin_write on public.outreach_campaigns for all to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  )
  with check (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );

drop policy if exists outreach_deliveries_admin_write on public.outreach_deliveries;
create policy outreach_deliveries_admin_write on public.outreach_deliveries for all to authenticated
  using (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  )
  with check (
    public.has_role(auth.uid(), 'group_ceo')
    or public.has_role(auth.uid(), 'sales_manager')
    or public.has_role(auth.uid(), 'crm_manager')
  );