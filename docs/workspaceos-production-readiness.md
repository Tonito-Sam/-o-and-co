# WorkspaceOS Production Readiness

## Product Scope

WorkspaceOS is the operating platform for Office & Co, not a prospect-intelligence product. Prospect Intelligence is one source of qualified opportunities; the platform must connect sales, branches, tenants, services, finance, and executive decisions through shared records and workflows.

## Product Domains

| Domain | Primary capabilities | Main users | Current foundation / gap |
|---|---|---|---|
| Platform and access | Authentication, user provisioning, role assignment, branch scope, audit history, integration health | Superadmin | Auth and role definitions exist; role provisioning and auditable administration need to be treated as production data, not demo configuration. |
| Executive overview | Group-wide performance, branch comparisons, risks, forecasts, recommended actions | Group CEO | Overview exists; consolidate live domain data before presenting predictive or prescriptive recommendations. |
| Sales and CRM | Prospect discovery, qualification, pipeline, communication templates, replies, tours, proposals, conversion | Sales Manager, branch sales | Prospect records are in Supabase; CRM pipeline still includes mock/local state and needs a shared lifecycle. Discovery introduction is first; further email sequence starts only after a response. |
| Branch operations | Office/desk inventory, occupancy, bookings, facilities, service requests, local performance | Branch Manager | Branch inventory and booking schemas exist; replace mock summaries and expose branch-scoped work queues. |
| Cafe operations | Branch menus, product availability, stock, stock movements, orders, kitchen workflow, cash-up | Proposed Cafe Manager; authorized branch staff | Cafe UI and products are mock-backed; source menus/images exist. Build branch-scoped persistence and inventory controls. |
| Tenant workspace | Organization registration, members, bookings, cafe orders, marketplace, invoices, support, community | Tenant Admin, Organization Member | Organization and membership data are in Supabase; connect remaining service workflows to persistent records. |
| Marketplace | Vendor onboarding, listings, inventory, orders, sales, invoices | Vendor, marketplace staff | Current listings, vendors, and order history include local/demo state; move to permissioned persistent records. |
| Events and Union Station | Venue enquiries, event packages, availability, quotes, event operations, menus, floor plan | Union Station Admin, sales, community staff | Dedicated views and source materials exist; digitize enquiries and connect them to quoting, booking, and operations. |
| Finance and Sage | Invoices, receivables, reconciliation, operational revenue, sync health, exception handling | Finance Lead | Sage client and billing UI exist; reporting still uses mock operational data in places. Define Sage as the finance system of record where applicable and make sync status explicit. |
| Community and content | Events, announcements, community posts, moderation, branch content | Community Manager, tenants | Routes exist; connect approvals, branch scope, content assets, and tenant-visible publication. |

## Role Model

Existing role IDs in the app include Superadmin, Group CEO, Sales Manager, Rosebank Sales, Branch Manager, Community Manager, Finance, Union Station Admin, Tenant Admin, Organization Admin/Member, Member, and External Vendor. Confirm the authoritative job titles and permission boundaries from the company documents before finalizing production role assignments.

Add a distinct branch-scoped Cafe Manager role if Cafe Managers should manage stock and menus without inheriting broad Community or Branch Manager permissions. Prefer capability-based permissions for actions such as editing inventory, publishing menus, approving bookings, reviewing forms, and managing finance over one broad role check.

Every internal dashboard should show only the user's authorized branch or group scope. Tenant and vendor views must remain scoped to their organization or vendor account.

## Source Material Use

- Use the vacancy sections of the company workbooks as reference input for office type, capacity, branch, and indicative price. Validate and reconcile these records with live inventory before showing availability or sending a prospect email.
- Treat occupied-tenant names, contact details, and rental information as restricted operational data. Do not expose them in public prospect or marketplace content.
- Use the Kyalami and Rosebank cafe menus and supplied cafe image sets to populate branch-specific cafe catalogs after confirming current prices, item names, and image-to-item mapping.
- Use Union Station enquiry, event, conference/training, floor-plan, photo, and menu materials to implement real venue packages, enquiries, quoting, and event operations.
- Digitize the Office & Co client forms and operating procedures into versioned forms, policy acknowledgements, and staff workflows. Preserve the source document, effective date, submitter, review decision, and audit trail.
- Review PDF contents before implementing policy rules or transcribing customer-facing menu and package details. The archives are extracted; the PDFs still require text/content review.

## Production Implementation Order

1. **Shared foundations:** Confirm role and branch model; use Supabase as the system of record; enforce row-level security; standardize activity history, ownership, timestamps, validation, and audit trails.
2. **Operational truth:** Reconcile branch, office, desk, cafe, and venue inventory with the source workbooks and live records. Add explicit owners and update workflows so availability, stock, and pricing stay current.
3. **Core service workflows:** Persist tenant bookings, cafe catalog/stock/orders, marketplace listings/orders, event enquiries/bookings, and CRM leads. Remove production reliance on browser-local state and demo figures.
4. **Digitized documents:** Convert approved forms and procedures into accessible submission and review workflows, with status, notifications, attachments, and immutable audit history.
5. **Communication automation:** Use editable, versioned templates. Send the discovery introduction first; do not send the follow-up sequence until a prospect responds. Personalize availability only from current, verified inventory and log every delivery and reply.
6. **Finance operations:** Reconcile operational transactions to Sage, provide retry/error queues and sync visibility, and distinguish authoritative Sage values from local drafts or estimates.
7. **CEO decision support:** Build group-level live KPIs first, then validated forecasts, risk alerts, and recommended actions with source, confidence, and assumptions visible. Recommendations must not silently commit financial or contractual decisions.

## Definition Of Production Ready

- Each dashboard is backed by authorized live data and has explicit loading, empty, error, stale-data, and permission states.
- Critical writes are validated server-side, idempotent where retried, and recorded in an audit/activity history.
- Branch, tenant, and vendor isolation is enforced by database policies, not only by hidden UI controls.
- Availability, prices, finance totals, and analytics identify their source and freshness; demo data is never presented as live data.
- Forms, messages, orders, bookings, and approvals have a visible owner, status, next action, and history.
- Integrations expose connection health, last successful sync, failures, and safe retry behavior.