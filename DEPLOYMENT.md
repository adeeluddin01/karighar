# KARIGHAR — Deployment Guide (Vercel + Supabase)

Follow top-to-bottom for a production launch. Est. 60–90 min.

## 1. Supabase (production project)

1. Create a **new** Supabase project for production (keep dev separate).
2. In **SQL Editor**, run `supabase/schema.sql` — and nothing else. It is the
   complete schema; every patch below is already folded in.

   Only an **existing** database needs the patches, in order, from wherever it
   left off:
   1. `supabase/schema.sql`   ← fresh projects: this file alone is enough
   2. `supabase/patch_v2.sql`
   3. `supabase/patch_v3_realtime.sql`
   4. `supabase/patch_v4_business_logic.sql`   ← integrity, accounting, notifications
   5. `supabase/patch_v5_settlements_disputes.sql`   ← settlements + disputes admin
   6. `supabase/patch_v6_price_lock.sql`   ← price immutability + booking rate-limit
   7. `supabase/patch_v7_provider_profiles.sql`   ← public provider profiles + cancel reasons
   8. `supabase/patch_v8_role_escalation.sql`   ← security: block admin self-escalation
   9. `supabase/patch_v9_fix_jobs_rls.sql`   ← CRITICAL: providers can see/accept the open job pool
   10. `supabase/patch_v10_fix_notify_cast.sql`   ← CRITICAL: unblocks status updates past 'assigned'
   11. `supabase/patch_v11_lock_provider_pii.sql`   ← SECURITY: stops `providers` leaking CNIC numbers to the anon key
   12. `supabase/patch_v12_customer_reviews_and_alerts.sql`   ← provider→customer ratings, signup role/phone metadata, chat notifications
   13. `supabase/patch_v13_restore_notifications_layer.sql`   ← CRITICAL for any project missing patch_v4/v5: restores the `notifications` table, `notify_user()` and `record_settlement()`
   14. `supabase/patch_v14_house_promos.sql`   ← `house_promos`: Karighar's own promo banners, editable without a redeploy
   15. `supabase/patch_v15_new_categories.sql`   ← 5 new categories (carpenter, painter, solar panel cleaning, camera installation, washing machine repair), each with one placeholder "On-site Quote" sub-service

   **Check this on any existing project**, whatever its history — some were
   built from a schema.sql predating patch_v4 and never got the notifications
   layer:

   ```sql
   select to_regclass('public.notifications') as tbl,
          to_regproc('public.notify_user')    as fn;
   ```

   If either column is `null`, run `patch_v13`. It is not optional: the
   patch_v12 triggers call `notify_user()`, and plpgsql resolves that name at
   execution rather than creation — so until v13 is applied, sending a chat
   message and rating a customer both abort at runtime.
3. **Authentication → URL Configuration.** Get this wrong and nobody can
   finish signing up — the confirmation email is built from these settings.
   - **Site URL:** `https://thekarighar.com`
   - **Redirect URLs** — one per line, note the **trailing slashes**:
     ```
     https://thekarighar.com/**
     https://thekarighar.com/auth/callback/
     https://thekarighar.com/signin/
     http://localhost:3000/**
     ```
   The app now sends an explicit `emailRedirectTo`, but GoTrue only honours it
   if it matches this allow-list — otherwise it silently falls back to the
   Site URL, and the "confirmation email points at localhost" bug looks
   unfixed. The trailing slash matters because `trailingSlash: true` exports
   `auth/callback/index.html`.
4. **Authentication → Providers → Email:** keep "Confirm email" **ON** for production.
5. (Optional) **Providers → Google:** see `README.md`'s "Google sign-in"
   section for the full 3-step setup (Google Cloud Console → Supabase
   provider → Supabase URL Configuration). The redirect URI in Google Cloud
   must be Supabase's own callback, `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
   — not this app's `/auth/callback` route — and the Site URL / Redirect URLs
   above must already match whatever domain you're actually testing on, or
   the OAuth redirect is silently dropped.
6. **Database → Backups:** ensure daily backups are enabled (paid plan).

> **Note:** every `thekarighar.com` URL on this page assumes that domain is
> the one actually live on this Vercel project. If you're testing on the
> default `*.vercel.app` URL (or any other domain) instead, use that domain
> in every Site URL / Redirect URL / Google Cloud value above — a mismatch
> here is the single most common reason Google sign-in or email confirmation
> "doesn't work" after otherwise-correct setup.

## 1b. Promo banners (optional)

The banner on the pro dashboard is a row in **`house_promos`**, so copy can
change from Supabase → Table editor without rebuilding the static export.

- `audience` — `provider`, `customer` or `all`
- `is_active` + `starts_at` / `ends_at` — RLS only returns rows that are
  currently live, so a draft is invisible even to someone poking the API
- `priority` — highest wins when several are live; the app shows one
- `cta_label` + `href` — omit both for a banner with no button

`patch_v14` seeds one example referral promo with `is_active = false`. Flip it
to `true` to publish it. Nothing renders when no row is live.

## 2. Google Maps

- Google Cloud Console → enable **Maps JavaScript API** + **Geocoding API** +
  **Directions API**. The last one powers the in-app route drawn on the
  provider's jobs map and active-job screen; without it those show
  "needs the Directions API enabled" and fall back to the external link.
- **Enable billing** on the project (required even for the free tier).
- Restrict the API key by **HTTP referrer** to your domain(s) + `localhost` for dev.

## 3. Vercel

1. Push this repo to GitHub and **Import** it in Vercel (root = `karighar/`).
2. **Environment Variables** (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` — **only set this once your custom domain is live
     on this Vercel project**, and to that exact domain. Leaving it unset is
     safer by default: the app correctly detects whatever origin is actually
     serving the request (the `*.vercel.app` URL, a preview URL, or a
     verified custom domain), with no further changes needed. Setting it to a
     domain that isn't actually live here silently breaks every Google OAuth
     redirect and every email-confirmation link.
   - There is no Google Client ID/Secret env var — those live only in
     Supabase's dashboard (Authentication → Providers → Google), never in
     the app itself. See `README.md`'s "Google sign-in" section.
3. Deploy. Add your custom domain in Vercel → Domains.

## 4. First admin

Sign up once on the live site, find your user id in Supabase → Authentication → Users, then:

```sql
update profiles set role = 'admin' where id = 'YOUR-USER-ID';
```

## 5. Pre-launch checklist

- [ ] `schema.sql` (fresh) or every outstanding `patch_v*.sql` in order, run on prod
- [ ] Maps billing enabled + key restricted
- [ ] Site URL + OAuth redirects set for the real domain
- [ ] Env vars set in Vercel; build green; custom domain live
- [ ] First admin created; test the full flow on prod (book → accept → complete → pay → rate)
- [ ] Recruit + verify 10–20 launch providers (Phase 0 supply)
- [ ] Swap placeholders: support email/WhatsApp (`src/lib/config.ts`), legal entity in Terms/Privacy
- [ ] (P1) Add Sentry for error monitoring; enable Supabase backups

## 6. Smoke test after every deploy

1. Sign up → confirm the emailed link points at the real domain → book a
   fixed service → confirm it appears in `/bookings`
2. As a second account, onboard as a Pro; approve via admin; accept the job; advance to paid
3. Customer sees live status + gets notifications; both ratings work
   (customer rates the pro, pro rates the customer)
