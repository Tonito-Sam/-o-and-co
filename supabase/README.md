# Supabase setup

The WorkspaceOS schema and feature migrations have a dependency order. The prospect and organization migrations depend on the base tables (`companies`, `branches`, `profiles`, `leads`, and role helpers) created by `schema.sql`.

For a project that currently has Supabase Auth but no WorkspaceOS public tables:

1. In the Supabase Dashboard, open **SQL Editor** for the linked project and run `supabase/schema.sql` once. This installs the WorkspaceOS base schema, branch records, organization onboarding tables/functions, and backfills profile rows for existing Auth users.
2. From this repository, run `supabase db push`. This applies the prospect intelligence, organization onboarding, branch inventory, CRM-to-tenant lifecycle, branch staff access, and financial overview migrations in order. These add tenant roster import, durable lead/tour/booking records, signed-lease activation, scoped role assignment, branch booking notifications, and real branch/group financial summaries.
3. Branch inventory tables cover section configuration, offices, desks, parking, equipment, reservations, shop items, shop orders, and order lines. Rooms, room bookings, feed, events, and support already use the existing WorkspaceOS tables.
4. Assign Office & Co platform roles explicitly in `public.user_roles`. Public sign-up only creates a basic `member`; organization invite codes never grant Office & Co staff or executive access.

## Public booking requests

The public workspace form creates a request, not a confirmed reservation or invoice. Branch managers, branch-scoped sales staff, and CRM staff review availability and submit a priced quote. Finance reviews the quote in Billing and issues the invoice; the branch confirms the booking only after that invoice is issued. Customer and internal email delivery is queued in `public.booking_email_outbox`, while internal users also receive in-app notifications.

To enable email delivery, configure the Supabase project secrets `RESEND_API_KEY` and `EMAIL_FROM`, then deploy the function:

```sh
supabase secrets set RESEND_API_KEY=<resend-api-key> EMAIL_FROM="Office & Co <bookings@officeand.co>"
supabase functions deploy deliver-booking-emails --no-verify-jwt --project-ref <project-ref>
```

Apply the new `202610230001_public_booking_request_workflow.sql` migration with the other migrations. The workflow writes durable outbox rows before delivery; a missing email secret or failed provider request leaves the row available for operational retry and does not roll back the booking request or invoice.

Existing lease rosters can be imported from the Tenants page as CSV. Export a roster sheet to CSV and include `organization_name`, `branch`, `tier`, `since`, `desks`, and `mrr_zar`; `lease_signed_at` is optional when the historical signature date is unknown. Matching organization profiles are linked by normalized name and branch. New lease tenants should be activated from CRM only after the workspace opportunity is marked contract signed and linked to its organization.

Branch assignments are stored in `public.user_roles.branch_id`. The branch access migration seeds the known group admin/CRM manager and branch manager accounts from their Auth profile emails; verify those accounts exist before applying it. Branch managers can assign café/community roles in their own branches, while only group administration can assign global roles.

The financial overview reports actual recurring rent, invoice collections and receivables, qualified pipeline, and pending bookings. The current schema does not contain an expense ledger, so profit, cost leakage, and operating margin are intentionally not reported until expense data is connected.

Do not run `supabase db push` before the base schema is installed: the prospect migration references `public.companies` and `public.branches`.
