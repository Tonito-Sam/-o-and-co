# Supabase setup

The WorkspaceOS schema and feature migrations have a dependency order. The prospect and organization migrations depend on the base tables (`companies`, `branches`, `profiles`, `leads`, and role helpers) created by `schema.sql`.

For a project that currently has Supabase Auth but no WorkspaceOS public tables:

1. In the Supabase Dashboard, open **SQL Editor** for the linked project and run `supabase/schema.sql` once. This installs the WorkspaceOS base schema, branch records, organization onboarding tables/functions, and backfills profile rows for existing Auth users.
2. From this repository, run `supabase db push`. This applies the prospect intelligence, organization onboarding, branch inventory, CRM-to-tenant lifecycle, branch staff access, and financial overview migrations in order. These add tenant roster import, durable lead/tour/booking records, signed-lease activation, scoped role assignment, branch booking notifications, and real branch/group financial summaries.
3. Branch inventory tables cover section configuration, offices, desks, parking, equipment, reservations, shop items, shop orders, and order lines. Rooms, room bookings, feed, events, and support already use the existing WorkspaceOS tables.
4. Assign Office & Co platform roles explicitly in `public.user_roles`. Public sign-up only creates a basic `member`; organization invite codes never grant Office & Co staff or executive access.

## Public booking requests

The public workspace form creates a request, not a confirmed reservation or invoice. Branch managers, branch-scoped sales staff, and CRM staff review availability and submit a priced quote. Finance or the assigned branch manager can issue the invoice; the branch confirms the booking only after that invoice is issued. Customer and internal email delivery is queued in `public.booking_email_outbox`, while internal users also receive in-app notifications.

Union Station has a separate visitor enquiry page (`/union-station`) and internal admin page (`/union-station-admin`). Authorized venue staff prepare quotes in the admin page; quote amounts and notes are recorded in the request and approval history.

To enable email delivery, configure the Supabase project secrets `RESEND_API_KEY` and `EMAIL_FROM`, then deploy the function:

```sh
supabase secrets set RESEND_API_KEY=<resend-api-key> EMAIL_FROM="Office & Co <bookings@officeand.co>"
supabase functions deploy deliver-booking-emails --no-verify-jwt --project-ref <project-ref>
```

Apply the new `202610230001_public_booking_request_workflow.sql` migration with the other migrations. The workflow writes durable outbox rows before delivery; a missing email secret or failed provider request leaves the row available for operational retry and does not roll back the booking request or invoice.

Existing lease rosters can be imported from the Tenants page as CSV. Export a roster sheet to CSV and include `organization_name`, `branch`, `tier`, `since`, `desks`, and `mrr_zar`; `lease_signed_at` is optional when the historical signature date is unknown. Matching organization profiles are linked by normalized name and branch. New lease tenants should be activated from CRM only after the workspace opportunity is marked contract signed and linked to its organization.

Branch assignments are stored in `public.user_roles.branch_id`. The branch access migration seeds the known group admin/CRM manager and branch manager accounts from their Auth profile emails; verify those accounts exist before applying it. Branch managers can assign café/community roles in their own branches, while only group administration can assign global roles.

## Office & Co staff account deletion

The superadmin Staff and Tenant accounts directories use the `manage-platform-account` Edge Function to suspend, reactivate, or delete accounts. It verifies the caller's superadmin role and protects privileged accounts. Deploy it with:

```sh
supabase functions deploy manage-platform-account --project-ref <project-ref>
```

The function uses the standard Supabase Edge Function `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets. It preserves required historical references before deleting the Auth user, then lets profile-linked memberships and roles cascade.

The financial overview reports actual recurring rent, invoice collections and receivables, qualified pipeline, and pending bookings. The current schema does not contain an expense ledger, so profit, cost leakage, and operating margin are intentionally not reported until expense data is connected.

## Café checkout and payment confirmation

Café orders are created by `public.create_cafe_order`, which validates the authenticated member, branch, current product prices, availability, and stock inside one database transaction. Charge-to-account orders create an organization invoice in the same transaction. Paystack orders remain `awaiting_payment` and are not sent to the kitchen until a verified payment is received.

Apply `202611060001_cafe_atomic_checkout.sql`, `202611060002_rosebank_chicken_prego.sql`, and `202611170001_cafe_paystack_inline_access_code.sql` after the base schema and existing café migrations. The second migration adds the omitted Rosebank Chicken Prego entry from the supplied menu; the last stores the server-created access code needed to resume Paystack's inline modal. Configure `PAYSTACK_SECRET_KEY` and `SITE_URL` as Supabase function secrets, then deploy:

```sh
supabase secrets set PAYSTACK_SECRET_KEY=<paystack-secret-key> SITE_URL=https://<production-host>
supabase functions deploy initialize-cafe-payment
supabase functions deploy verify-cafe-payment
supabase functions deploy cafe-payment-webhook --no-verify-jwt
```

Configure the Paystack dashboard webhook URL as `https://<project-ref>.supabase.co/functions/v1/cafe-payment-webhook`. Keep the Paystack secret only in Supabase; the browser opens Paystack InlineJS with the server-created access code, and the server verifies payment before an order enters the kitchen queue. Until the migrations and functions are deployed with valid credentials, Paystack checkout will fail closed and orders will not appear in the kitchen queue.

Keep `VITE_CAFE_PAYSTACK_ENABLED` unset or `false` until the migration, all three functions, secrets, and webhook have been verified in the target environment. Set it to `true` only in that environment's frontend build configuration to expose the payment option.

Run `npm run check:production` before merging. It performs TypeScript checking, lint, CRM/analytics/café live-data regression checks, and a production build; GitHub Actions runs the same command for pushes and pull requests.

Do not run `supabase db push` before the base schema is installed: the prospect migration references `public.companies` and `public.branches`.

## Facility space galleries

The `202611200001_facility_space_galleries.sql` migration adds branch-scoped facility spaces, private photo storage, and edit permissions for group administrators, the Group CEO, Finance, and assigned branch managers. Apply the migration after the existing WorkspaceOS migrations:

```sh
supabase db push
```

The Kyalami source archive is local and is not included in Git. After confirming the migration is applied and the source directory `welcomemedia/Kyalami-and Union-Station/Office & Co Kyalami` is present, run a dry check and then import the original-resolution images:

```sh
node scripts/import-facility-spaces.mjs --dry-run
node scripts/import-facility-spaces.mjs
```

The importer reads `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` from the process environment or the local `.env` file. Keep the service-role key private and never commit `.env`. The import is safe to rerun: space rows are upserted by branch/code, existing deterministic photo objects are reused, and obsolete importer-managed photos are removed without affecting manager-added uploads. Office 319 appears in both occupied and vacant source folders; its selected photos follow the active tenant roster, and the conflict is retained in facility metadata for review.

The `202611200003_facility_lease_expiry_and_vacant_tours.sql` migration adds lease-expiry tracking in the facility editor and manager-published vacant-office photos for the public Kyalami virtual tour. Lease expiry is only an alert: a manager must confirm non-renewal before marking an occupied space vacant. Only photos explicitly added to the tour are copied to the public tour bucket; occupied or otherwise non-vacant spaces are excluded.
