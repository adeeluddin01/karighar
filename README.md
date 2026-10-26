# KARIGHAR

On-demand home-services marketplace for Pakistan (Karachi). Web-first PWA.
Next.js 16 + Supabase. See [`../BUILD_SPEC.md`](../BUILD_SPEC.md) for the full product spec.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the landing page runs without any backend yet.

## Connect Supabase (needed for auth, booking, providers)

1. Create a free project at https://supabase.com.
2. In the project's **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).

   **That's the whole thing** — tables, triggers, security policies, the
   verification storage bucket, realtime, and the seeded Karachi catalog.
   Every patch below is already folded into it, so a new project needs
   nothing else.

<details>
<summary>Upgrading an <strong>existing</strong> database? Run the patches you've missed, in order.</summary>

   - [`supabase/schema.sql`](supabase/schema.sql) — tables, security policies, seeded Karachi catalog.
   - [`supabase/patch_v2.sql`](supabase/patch_v2.sql) — provider job access, rating trigger, verification storage bucket.
   - [`supabase/patch_v3_realtime.sql`](supabase/patch_v3_realtime.sql) — **required** for live chat, live location tracking, and live status updates.
   - [`supabase/patch_v4_business_logic.sql`](supabase/patch_v4_business_logic.sql) — **required**: server-enforced pricing/status/reviews, COD payment + commission ledger, and notifications.
   - [`supabase/patch_v5_settlements_disputes.sql`](supabase/patch_v5_settlements_disputes.sql) — **required**: commission-settlement RPC + disputes admin access.
   - [`supabase/patch_v6_price_lock.sql`](supabase/patch_v6_price_lock.sql) — **required**: locks a job's price once set (anti-tamper), lets Pros price quote jobs, and rate-limits bookings.
   - [`supabase/patch_v7_provider_profiles.sql`](supabase/patch_v7_provider_profiles.sql) — **required**: public provider-profile view (for `/providers/[id]`) + cancellation-reason column.
   - [`supabase/patch_v8_role_escalation.sql`](supabase/patch_v8_role_escalation.sql) — **required (security)**: blocks users from making themselves admin.
   - [`supabase/patch_v9_fix_jobs_rls.sql`](supabase/patch_v9_fix_jobs_rls.sql) — **required (critical)**: fixes job visibility so approved providers can see/accept the open job pool.
   - [`supabase/patch_v10_fix_notify_cast.sql`](supabase/patch_v10_fix_notify_cast.sql) — **required (critical)**: fixes an enum-cast crash that blocked all status updates past "assigned".
   - [`supabase/patch_v11_lock_provider_pii.sql`](supabase/patch_v11_lock_provider_pii.sql) — **required (security)**: `providers` was world-readable, exposing CNIC numbers and document paths to anyone with the anon key. Locks the table to owner/admin and serves public pro data from the `public_provider_profiles` view instead. Re-creates that view, so it also covers a project where patch_v7 was skipped.
   - …through `patch_v18`. [`DEPLOYMENT.md`](DEPLOYMENT.md) carries the full numbered list; two are worth calling out:
   - [`supabase/patch_v17_lock_rating_and_verification.sql`](supabase/patch_v17_lock_rating_and_verification.sql) — **required (security)**: RLS is row-level, so `prov_self`/`cust_self` let an owner write *every* column of their own row — including `providers.status`. A self-registered pro could approve themselves into the job pool and publish a fake 5.0 rating. Also fixes a live bug where an approved pro silently demoted themselves by editing their bio.
   - [`supabase/patch_v18_business_accounts.sql`](supabase/patch_v18_business_accounts.sql) — business accounts: a dispatcher with technicians beneath it, the open-pool lockout, and commission billed to the business. Lands with no visible change until a business is granted.
     *(Patches are idempotent and safe to re-run.)*

</details>

See [`../LAUNCH_READINESS.md`](../LAUNCH_READINESS.md) for the full architect audit and
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the production (Vercel) checklist.
3. Copy `.env.local.example` → `.env.local` and fill in your project's **URL** and key
   (Project Settings → API). The **publishable key** goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — either name works).
4. **For fast testing:** in Supabase → **Authentication → Sign In / Providers → Email**,
   turn **off** "Confirm email" so signups log in instantly. (Turn it back on for production.)
5. Restart `npm run dev`.

### Make yourself an admin

After signing up once, find your user id in Supabase → Authentication → Users, then run in SQL Editor:

```sql
update profiles set role = 'admin' where id = 'YOUR-USER-ID';
```

Now `/admin` unlocks (verify providers, manage catalog, monitor jobs).

### Google Maps

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` must have **Maps JavaScript API**, **Geocoding API**
and **Directions API** enabled (Google Cloud Console → APIs). If you set HTTP-referrer
restrictions, allow `http://localhost:3000/*` and your production domain.

The Directions API is what draws the route *inside* the app on the provider's
jobs map and active-job screen. Without it those buttons report that it needs
enabling, and the external "Open in Google Maps" link still works.

### Google sign-in (optional)

The app code needs no Google env vars at all — `signInWithOAuth({ provider: "google" })`
is handled entirely by Supabase. Three places to configure, in this order:

1. **Google Cloud Console** → APIs & Services → Credentials → Create an OAuth
   client ID (Web application).
   - Authorized redirect URIs: **Supabase's own callback**, not this app's —
     `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Pointing this at the
     app's `/auth/callback` instead is the most common mistake.
   - Authorized JavaScript origins: your production URL(s) + `http://localhost:3000`.
   - While the OAuth consent screen is in "Testing" status, only the Google
     accounts listed under **Test users** can sign in — add your own account
     there, or publish the app, or sign-in will silently fail for everyone else.
2. **Supabase → Authentication → Providers → Google** — paste the Client ID
   and Client Secret from step 1.
3. **Supabase → Authentication → URL Configuration** — Site URL and Redirect
   URLs must match the domain you actually test on (e.g.
   `https://your-app.vercel.app/**`). A redirect to a URL not on this list is
   silently ignored, which looks like "nothing happens."

If you deploy with `node --env-file=.env.local scripts/deploy.mjs`, do **not**
set `DEPLOY_SITE_URL` to a domain that isn't actually live on this Vercel
project — the app already detects its own origin correctly when
`NEXT_PUBLIC_SITE_URL` is left unset, and pinning the wrong domain there
breaks every OAuth redirect silently.

## Try the full flow

1. Sign up as a **customer** → `/book` → book an AC service.
2. In another browser/incognito, sign up as a **provider** → `/pro/onboarding` → submit.
3. As **admin**, go to `/admin/providers` → approve the provider.
4. As the **provider** → `/pro/dashboard` → accept the job → advance status.
5. Back as the **customer** → `/bookings/[id]` → watch it update live, chat, then rate.

### …and the business flow

A **business** dispatches work to technicians instead of doing it. There is no
public signup — see "Business accounts" in [`DEPLOYMENT.md`](DEPLOYMENT.md).

1. As **admin** → `/admin/businesses` → paste a (non-technician) account's
   user id → Grant.
2. As that account → `/business/team` → invite an **approved** technician by
   phone number and set their split.
3. As that technician → `/pro/dashboard` → the invite banner → Join.
   Their open-pool tab disappears; so do their open-pool rows, in RLS.
4. Back as the business → `/business` → Assign an open job to them. The
   customer and the technician are both notified, and from here on the
   customer deals with the **technician** — chat, the call button and live
   tracking all work exactly as for an independent pro.
5. Take the job to paid. The technician's `/pro/history` shows what they owe
   their **business**; `/business/earnings` and `/admin/settlements` show the
   commission owed to Karighar by the **business**.

## Structure

```
src/
  app/            # routes (App Router)
    page.tsx      # public landing (services + prices)
  lib/
    catalog.ts    # seed catalog (mirrors DB) for the landing view
    supabase/
      client.ts   # browser Supabase client
      server.ts   # server Supabase client
supabase/
  schema.sql      # full DB schema + RLS + Karachi seed catalog
```

## Roadmap (v1)

- [x] Project + DB schema + branded landing
- [x] Auth (email + password; captures name + phone) + customer / provider / admin roles
- [x] Customer booking flow (fixed price + custom job + bids)
- [x] Provider onboarding + CNIC verification (admin-approved)
- [x] Live job status (realtime) + in-app chat
- [x] Ratings & reviews · COD (commission tracked on job)
- [x] Admin panel (verification, catalog, jobs monitor)
- [x] Google Maps — location pin on booking + live provider tracking + provider jobs map
- [x] Role-aware navigation (customer vs provider) with bottom tab bar
- [x] Profile + Settings pages · provider My Services / History / Map
- [x] Customer service search
- [x] Google OAuth sign-in
- [x] Installable PWA (manifest + generated icons)
- [x] Server-enforced business logic (pricing, status state-machine, review integrity)
- [x] COD payment + commission ledger automation
- [x] In-app notifications (bell + realtime + /notifications)
- [x] Error/404/loading boundaries · toasts · legal & support pages · health check · robots/sitemap
- [x] Provider wallet (ledger-based earnings + commission owed) · admin settlements
- [x] Disputes: "report a problem" on jobs + admin resolution UI
- [x] Automated tests (Vitest) for money/accounting + status state-machine
- [x] Business accounts — a dispatcher with technicians beneath it, open-pool
      lockout, commission billed to the business
- [ ] Phone OTP auth (needs an SMS provider) — replaces email/password
- [ ] Email notifications + Sentry monitoring + rate limiting (P1)
- [ ] Escrow + online payments (JazzCash/Easypaisa) · Directions/ETA (P2)

## Testing

```bash
npm test        # Vitest unit tests (money/accounting, status machine, validation)
npm run build   # type-check + production build
```

## Brand assets

`public/brand/karighar-logo-3d.svg` is the master. Everything else is derived
from it, so change that file and re-bake rather than editing an icon by hand:

```bash
node scripts/icons.mjs
```

That writes `src/app/{icon.png, apple-icon.png, favicon.ico}` and
`public/icon-{192,512}.png` plus `icon-maskable-512.png`.

| File | What it is |
|---|---|
| `karighar-logo-3d.svg` | The mark with its materials — lit chamfer, brushed grain, velvet, cast shadow. Used on screen via `<Logo>`. |
| `karighar-logo-square.svg` | Same, tile bled to the edges. iOS rounds a home-screen icon itself and ignores alpha, so `apple-icon.png` comes from this one. |
| `karighar-logo-maskable.svg` | Full-bleed with the mark pulled into the inner 78%, for Android's maskable crop. |
| `karighar-logo.svg` | Gradients only, no filters — a fallback where SVG filters aren't honoured. |
| `karighar-logo-flat.svg` | Flat colour. Print, signage, one-colour work. |
| `karighar-mark.svg` | Glyph only, `currentColor`, no tile. |

Two things worth knowing before you touch it. The materials are SVG filters,
which is why `<Logo>` renders an `<img>` rather than inlining the SVG — filter
ids are document-global, and two inline copies on one page would both resolve
to whichever came first. And the icons are rendered at 2× and downsampled:
the velvet pile's fine layer is sub-pixel at icon sizes, so rasterising
straight to the target turns it into harsh per-pixel noise that looks wrong
and triples the file size.

## Demo videos (customer / provider / admin walkthroughs)

Records MP4 walkthroughs of each role using Playwright + ffmpeg.

```bash
# 1. Put the real service-role (secret) key in .env.local: SUPABASE_SERVICE_ROLE_KEY=...
# 2. Seed demo accounts (creates confirmed customer/provider/admin):
node --env-file=.env.local scripts/seed.mjs
# 3. Make sure the dev server is running (npm run dev), then:
node scripts/record.mjs                 # all three
node scripts/record.mjs customer        # or one role
```

Output MP4s land in `videos/`. Demo logins use password `Karighar#2026`.

## Email notifications (deploy Monday)

Scaffold in `supabase/functions/send-notification-email/`. Deploy with a Resend key
and a Database Webhook on `notifications` INSERT — see the file header for steps.
