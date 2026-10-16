# Karighar — On-Demand Home Services Marketplace

**An end-to-end marketplace web app for booking trusted home-service providers (plumbers, electricians, AC technicians and more) in Karachi, Pakistan — with customer/provider/admin roles, live job tracking, in-app chat, COD payments and a commission ledger.**

> Repository: [github.com/adeeluddin01/karighar](https://github.com/adeeluddin01/karighar)
> Status: functional MVP, under active development. **The public demo is currently offline** (previously at `karighar-taupe.vercel.app`).

---

## The problem

Finding a reliable plumber, electrician or AC technician in Karachi still runs on word of mouth and phone calls. Customers can't compare providers, agree on a price upfront, or track a job once booked. Providers have no credible storefront and lose income to middlemen. There is no shared record of what was agreed, what was paid, or how the work went.

## The solution

Karighar is a web-first progressive web app that puts the whole transaction on rails:

- **Customers** browse a seeded service catalog with fixed prices, book instantly or post a custom job and collect provider bids.
- **Providers** onboard with CNIC verification, get approved by an admin, set services, accept jobs from an open pool, and track earnings in a wallet.
- **Admins** verify providers, manage the catalog, monitor every job, resolve disputes and settle commissions.

Pricing is locked once agreed (anti-tamper), job status follows a server-enforced state machine, reviews can only come from completed jobs, and COD payments flow through a commission ledger — so nobody has to take anyone's word for it.

---

## Features

### For customers
- Service catalog with fixed pricing, search and category browsing
- Instant booking, custom-job requests, and provider bidding
- Live job status updates, live provider location tracking and in-app chat (Supabase Realtime)
- Ratings & reviews (only after job completion — enforced server-side)
- Booking history, notifications, profile & settings
- Google Maps location pin on booking

### For providers
- Onboarding flow with CNIC/document verification (admin-approved)
- Open job pool, job acceptance, status advancement
- Provider dashboard, jobs map with live location, service & history management
- Wallet: ledger-based earnings, commission owed, settlement tracking
- Ratings received from customers

### For admins
- Provider verification queue (approve / reject with documents)
- Catalog management, jobs monitor, disputes resolution UI
- Commission settlements and financial ledger views
- Role-escalation protection and PII access controls

### Platform
- Email + password auth and Google OAuth (via Supabase Auth), three roles (customer / provider / admin) with row-level security
- Server-enforced business logic: pricing, status transitions, review integrity, COD + commission ledger
- Realtime layer: chat, live location, live status, notifications
- Installable PWA (manifest + icons), role-aware navigation, error/loading boundaries, toasts
- Legal & support pages, health check, sitemap/robots
- Vitest unit tests covering money/accounting logic, the job status state machine and validation

---

## Architecture

```
Next.js 16 (App Router, React 19, TypeScript)
        │  @supabase/ssr  (cookie-based auth, server + browser clients)
        ▼
Supabase (PostgreSQL)
  ├── 15 SQL migrations: schema.sql + patch_v2 … patch_v15
  ├── Row-Level Security on every table (incl. a dedicated PII-locking
  │    patch: provider CNIC/documents hidden behind an owner/admin-only
  │    policy, public data served from a safe view)
  ├── Realtime: chat messages, job status, provider location, notifications
  └── Edge function scaffold: supabase/functions/send-notification-email
```

Key engineering decisions:

- **Database as the source of truth.** Business rules (price locking, status state machine, review eligibility, commission computation) are enforced in PostgreSQL via triggers/functions/RPCs, not just in UI code — the client can't bypass them.
- **RLS-first security.** A dedicated migration (`patch_v11`) locked the `providers` table after a review found CNIC numbers world-readable; public provider profiles now come from a restricted view.
- **Idempotent migrations.** All 15 SQL patches are safe to re-run, in order — a fresh Supabase project needs only `schema.sql`.
- **Seeded catalog.** The Karachi service catalog is seeded in SQL and mirrored in `src/lib/catalog.ts` so the landing page renders without a backend.

---

## Tech stack

| Layer      | Technology |
|------------|------------|
| Framework  | Next.js 16.3.1 (App Router), React 19, TypeScript 5 |
| Styling    | Tailwind CSS 4 |
| Backend / DB | Supabase (PostgreSQL, Auth, Realtime, Storage), 15 SQL migrations |
| Maps       | @vis.gl/react-google-maps (booking pin, provider tracking, jobs map) |
| Icons      | lucide-react |
| Testing    | Vitest (13 test files), Playwright (demo-video recording) |
| Tooling    | ESLint 9, TypeScript strict |

---

## Getting started

### Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) project
- A Google Cloud API key with **Maps JavaScript API**, **Geocoding API** and **Directions API** enabled (only needed for map features)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in your values (see `ENV_EXAMPLE.txt` in this repo for every variable, documented):

```bash
cp .env.example .env.local
```

Minimum for local development (landing page works with no backend at all):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

### 3. Set up the database

In your Supabase project's **SQL Editor**, run `supabase/schema.sql`. That's the whole thing — tables, triggers, RLS policies, realtime, storage bucket and the seeded Karachi catalog.

If you're upgrading an existing database, run the patches you've missed **in order**: `patch_v2.sql` → `patch_v3_realtime.sql` → `patch_v4_business_logic.sql` → `patch_v5_settlements_disputes.sql` → `patch_v6_price_lock.sql` → `patch_v7_provider_profiles.sql` → `patch_v8_role_escalation.sql` → `patch_v9_fix_jobs_rls.sql` → `patch_v10_fix_notify_cast.sql` → `patch_v11_lock_provider_pii.sql` → `patch_v12_customer_reviews_and_alerts.sql` → `patch_v13_restore_notifications_layer.sql` → `patch_v14_house_promos.sql` → `patch_v15_new_categories.sql`. All patches are idempotent.

### 4. Auth setup (Supabase dashboard)

- **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email" for fast local testing (turn it back on for production).
- **Google sign-in (optional):** enable the Google provider under **Authentication → Providers**, add your Google OAuth client ID/secret there, and set the redirect URI to `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.

### 5. Make yourself an admin

Sign up once in the app, find your user ID in Supabase → Authentication → Users, then run:

```sql
update profiles set role = 'admin' where id = 'YOUR-USER-ID';
```

`/admin` unlocks: provider verification, catalog, jobs monitor, disputes, settlements.

### 6. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Try the full flow: sign up as a **customer** → book an AC service at `/book`; in an incognito window sign up as a **provider** → `/pro/onboarding`; as **admin** approve them at `/admin/providers`; as the **provider** accept the job and advance its status; back as the **customer**, watch it update live, chat, then rate.

Demo accounts can be seeded with the service-role key (see `scripts/seed.mjs`):

```bash
node --env-file=.env.local scripts/seed.mjs
```

Seeded logins: `demo.customer@karighar.pk`, `demo.provider@karighar.pk`, `demo.admin@karighar.pk` (password `Karighar#2026`).

---

## Testing

```bash
npm test        # Vitest — money/accounting, status state machine, validation, geo, auth
npm run build   # TypeScript check + production build
npm run lint    # ESLint 9
```

---

## Demo videos

Recorded walkthroughs (Playwright + ffmpeg) live in `videos/`:

- `karighar-public-tour.mp4` — public landing tour
- `karighar-customer.mp4` — booking flow
- `karighar-provider.mp4` — onboarding → job acceptance
- `karighar-admin.mp4` — verification & monitoring

Regenerate with `node scripts/record.mjs` (needs the dev server running and seeded demo accounts).

---

## Project status & limitations

Honest accounting of where things stand:

- **Working:** auth (email + Google), three roles, booking (fixed/custom/bids), provider onboarding + admin verification, realtime chat/location/status, ratings, COD + commission ledger, wallet, disputes, settlements, notifications, Google Maps integration, PWA installability, admin panel.
- **Scaffolded, not wired:** the email-notification edge function exists as a scaffold (`supabase/functions/send-notification-email/`) and needs a Resend key + DB webhook to go live.
- **Not started:** online payments (JazzCash/Easypaisa integration is roadmap P2), phone-OTP auth (roadmap; needs an SMS provider), Sentry monitoring and rate limiting (roadmap P1).
- **Demo:** the previously deployed demo is currently offline; run locally per the instructions above.
- **Provenance:** this repository is a fork with original development on top of it (21 commits, the majority by the maintainer). It is presented as active development work, not a finished commercial product. No users, revenue or production-traffic claims are made.

---

## Repository

[github.com/adeeluddin01/karighar](https://github.com/adeeluddin01/karighar) — issues and pull requests welcome.

---

## License

This repository currently has **no license file**. By default that means all rights are reserved by the copyright holder(s) — strictly speaking, others may view the code but have no permission to use, modify or distribute it. If you are the owner and want to permit reuse (including by future clients or employers evaluating this work), add an explicit license: MIT is the common choice for portfolio projects. Note: this repo is a fork, so also respect the licensing terms of the upstream project before relicensing any of its code.
