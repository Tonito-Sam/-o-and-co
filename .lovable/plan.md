# Implementation Plan

Big scope — confirming before I build so nothing gets lost. Everything stays on the existing mock-data layer for the UI, plus a complete SQL bundle you can paste into Supabase.

## 1. Union Station — Corporate Event Booking & Approval

New route `/union-station` (also linked from Events and Bookings):
- Hero card with venue specs (capacity 300, halls, AV, catering).
- **Request form**: client, event type, date, start/end time, expected attendance, layout (theatre/banquet/cabaret/expo), catering, AV add-ons, contact, notes.
- Auto-calculated **pricing estimate** (base venue + per-head catering + AV + after-hours surcharge).
- **Approvals workflow** with status pills: `Draft → Submitted → In Review → Quoted → Confirmed → Invoiced → Completed` (plus `Declined`).
- Approval queue table for Events Manager / Group CEO with approve / decline / request changes actions.
- Confirmation status panel with deposit %, balance due, contract sent, signed.
- Calendar conflict warnings against existing Union Station bookings.

## 2. Internal Messaging upgrades (`/messaging`)

- **Channels list** with **subscribe / unsubscribe** toggles, mute, and "Browse all channels" dialog.
- **DM composer**: new DM dialog with member picker (exec & management only).
- **Read receipts**: per message, avatars of who's seen it + "Seen by N" rollup. Last-read marker line ("New").
- **Role-based visibility**: each channel has an `allowedRoles` list; sidebar filters channels not allowed for current role. Private channels show a lock + "Restricted" tag.
- Channel settings drawer: members, allowed roles, retention, audit-log link.

## 3. Role-based Community Module Controls

- Extend `RoleDef` with `communityModules: { community, events, marketplace, cafe, content }` access flags.
- New **Role Settings** page `/settings/roles` (Group CEO + Admin only): matrix of roles × community modules with toggles, persisted to localStorage.
- `AppSidebar` filters community-group nav using role flags.
- Group CEO's existing `showCommunity` master switch in TopBar remains — when off, hides the whole community group regardless of per-module flags.

## 4. Community Engagement Analytics Card

On Executive Overview (`/`):
- New "Community Engagement" card showing **Active members**, **Engagement level** (with sparkline), **New members this week**, top contributing branch.
- Visible only when `role.id !== "group-ceo" || showCommunity` (matches the existing toggle behavior). Smooth fade transition.

## 5. Auth Pages

Public routes (no auth gate):
- `/auth/sign-in` — email + password, **Remember me** checkbox, social SSO buttons (Google, Microsoft), "Forgot password" link.
- `/auth/sign-up` — name, work email, company, password + strength meter, T&Cs.
- `/auth/forgot-password` — email request, success state.
- `/auth/reset-password` — new password + confirm, token from URL.
- `/auth/verify-email` — code entry / resend.
- `/auth/mfa` — 6-digit OTP.
- `/auth/sso` — SAML enterprise sign-in.
- Shared `AuthLayout` with Office & Co branding, split-screen elegant design.

These are **UI-only** (no backend wiring) — they post to a stub. Hooking them to Supabase Auth is a separate flip once you're ready.

## 6. Public Landing Page

- New top-level route `/welcome` (the marketing site) and move the current dashboard to `/dashboard`. `/` becomes a smart redirect: signed-in → `/dashboard`, otherwise → `/welcome`.
- Sections: nav, hero ("Workspaces that work as hard as you do"), branch showcase (Kyalami, Bryanston, Rosebank, Union Station + coming-soon cities), membership tiers, Union Station event venue feature, testimonials, community highlights, FAQ, CTA, footer.
- SEO meta + OG tags.

## 7. Supabase SQL bundle

A single SQL file `supabase/schema.sql` containing the **entire schema** for the project — ready to paste into the Supabase SQL editor. Includes:

- Enums: `app_role`, `branch_status`, `lead_stage`, `booking_status`, `event_status`, `ticket_status`, `post_status`, `channel_visibility`, `subscription_tier`, `invoice_status`.
- Tables: `profiles`, `user_roles`, `branches`, `companies`, `tenants`, `employees`, `memberships`, `facilities`, `rooms`, `bookings`, `union_station_requests`, `union_station_approvals`, `leads`, `deals`, `events`, `event_rsvps`, `cafe_orders`, `marketplace_listings`, `community_posts`, `post_reactions`, `post_comments`, `support_tickets`, `messaging_channels`, `channel_members`, `channel_messages`, `message_receipts`, `direct_messages`, `notifications`, `invoices`, `payments`, `role_module_access`, `audit_log`.
- `has_role()` security-definer function.
- RLS enabled on every public-schema table with per-role policies.
- GRANTs to `authenticated`, `anon` (only where appropriate), `service_role` on every table.
- Triggers: `handle_new_user` → creates profile; `updated_at` touch trigger; community post moderation queue trigger.
- Indexes on FKs, status columns, and date ranges for performance.

## Technical notes
- Files: `src/routes/union-station.tsx`, `src/routes/welcome.tsx`, `src/routes/dashboard.tsx`, `src/routes/auth.*.tsx` (8 files), `src/routes/settings.roles.tsx`, `src/components/AuthLayout.tsx`, updates to `mock.ts`, `role-context.tsx`, `AppSidebar.tsx`, `TopBar.tsx`, `messaging.tsx`, `index.tsx`, `events.tsx`. New `supabase/schema.sql`.
- All UI stays on mock data; SQL is delivered as a file for you to run when you flip on Lovable Cloud.

Reply "go" and I'll build it all in one pass, or tell me to trim/split.
