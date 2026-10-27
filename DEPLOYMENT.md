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
   16. `supabase/patch_v16_provider_profile_for_customers.sql`   ← a customer sees the pro on their own job or bid at any status (names/avatars stopped going blank on their own bookings)
   17. `supabase/patch_v17_lock_rating_and_verification.sql`   ← **SECURITY**: `providers.status`/`verified_at` and the `providers`/`customers` rating columns were self-writable, so a pro could approve themselves into the job pool and publish a fake 5.0. Also fixes a live bug where an approved pro demoted themselves by editing their bio.
   18. `supabase/patch_v18_business_accounts.sql`   ← business accounts: a dispatcher with technicians beneath it, the open-pool lockout for attached technicians, and commission billed to the business instead
   19. `supabase/patch_v19_quote_after_arrival.sql`   ← a pro can only price a quote job once they are on site (`arrived`/`in_progress`); the customer awarding a bid is unaffected
   20. `supabase/patch_v20_admin_email_lookup.sql`   ← lets an admin resolve the email behind an account, so the Providers and Businesses tabs can be searched by email as well as name/phone
   21. `supabase/patch_v21_financial_integrity.sql`   ← **CRITICAL (financial)**: closes the audit findings in `FINANCIAL_AUDIT.md`. Without it any signed-in customer can assign any technician at any price and walk the job alone to `paid`, booking a commission debt for work that never happened. Also adds the refund/reversal path, caps both settlement RPCs, and makes `payments` reconcilable.
   22. `supabase/patch_v22_business_verification.sql`   ← **BREAKING for `/admin/businesses`**: a business is a real, located trading entity, so `grant_business_account()` now takes the owner's CNIC, the premises address and its coordinates — the old one-argument form is dropped and the admin screen calls the new one. Adds `business_services` (what a company covers) and publishes the premises and trades so companies appear on the customer's map. Businesses granted earlier keep trading and are flagged as incomplete on that screen.
   23. `supabase/patch_v23_avatars.sql`   ← profile pictures. `profiles.avatar_url` has existed since the first schema and is read in a dozen places, but nothing ever wrote it and there was no bucket to write to. Adds a **public** `avatars` bucket with folder-per-account write policies. The private `verification` bucket (CNIC scans) is untouched — an avatar must never share it.
   24. `supabase/patch_v24_commission_rates.sql`   ← **money**: Karighar's cut was hardcoded (0.20 fixed / 0.15 custom) in `jobs_enforce_insert`. Adds `platform_settings` holding four admin-editable defaults — a fixed-price and an on-quote rate for technicians, and the same pair for companies, edited on the Providers and Businesses tabs respectively — plus a nullable per-account `commission_rate` override on `providers` and `businesses`. The rate is resolved against whoever is actually billed when the provider is stamped, then frozen on the job. Both guards coerce the new column, so a pro cannot set their own commission to zero.

   > **If you last deployed before this list reached item 16**, run 16, 17 and
   > 18 now. Item 16 went into `schema.sql` but was never added here, so a
   > database brought forward by this list alone has missed it.

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

## 4b. Business accounts (optional)

A **business** is a dispatcher: it claims jobs from the open pool and assigns
them to technicians on its own team. There is no public signup — Karighar
grants these by hand, from **/admin/businesses** (paste the account's user id
from Supabase → Authentication → Users, the same place the first admin comes
from). SQL equivalent, if you'd rather:

```sql
select grant_business_account('THEIR-USER-ID');
```

What this does and does not change:

- **Technicians are still verified individually.** A business never creates or
  vouches for an identity — it invites an *already-approved* technician by
  phone number, who accepts or declines. The CNIC/selfie flow is untouched.
- **A business cannot also be a technician.** The grant refuses an account
  with an approved `providers` row: a dispatcher never works jobs, so it
  carries no verification of its own.
- **An attached technician leaves the open pool.** This is enforced in RLS
  (`jobs_select`/`jobs_claim`), not just hidden in the UI, and a trigger
  covers the one path that writes `provider_id` from outside them — a
  customer awarding a bid.
- **Commission moves to the business.** Karighar bills the dispatcher, which
  then settles with its own technicians at whatever split the two agreed.
  There is still exactly one commission row per job, so `/admin/settlements`
  works on a business with no changes — businesses just appear in the list.
- **Two separate debts, never netted.** In the COD model the technician
  collects the cash on site, so a dispatched job leaves them owing their
  business its share, and the business owing Karighar the commission. The
  business records the first on `/business/earnings` ("Cash held by your
  team" → Received); an admin records the second on `/admin/settlements`, as
  today. A technician on a team owes Karighar nothing.

To pause one without deleting it, use Suspend on `/admin/businesses`. It can
no longer take or assign work and loses the dispatch console; jobs already
with its technicians run to completion, and **its technicians go back to the
open pool** rather than being stranded with no source of work. Deleting a
business that has ever dispatched a job is deliberately refused — the same
rule that already protects a provider with job history.

## 5. Pre-launch checklist

- [ ] `schema.sql` (fresh) or every outstanding `patch_v*.sql` in order, run on prod
- [ ] Maps billing enabled + key restricted
- [ ] Site URL + OAuth redirects set for the real domain
- [ ] Env vars set in Vercel; build green; custom domain live
- [ ] First admin created; test the full flow on prod (book → accept → complete → pay → rate)
- [ ] Recruit + verify 10–20 launch providers (Phase 0 supply)
- [ ] Swap placeholders: support email/WhatsApp (`src/lib/config.ts`), legal entity in Terms/Privacy
- [ ] Brand icons current — re-run `node scripts/icons.mjs` if
      `public/brand/karighar-logo-3d.svg` changed since the last build
- [ ] (P1) Add Sentry for error monitoring; enable Supabase backups

## 6. Smoke test after every deploy

1. Sign up → confirm the emailed link points at the real domain → book a
   fixed service → confirm it appears in `/bookings`
2. As a second account, onboard as a Pro; approve via admin; accept the job; advance to paid
3. Customer sees live status + gets notifications; both ratings work
   (customer rates the pro, pro rates the customer)

If you run business accounts, also check the two things that can only be
wrong in production:

4. From an **attached** technician's session, confirm the open pool is empty
   over the REST API directly, not just in the UI:
   `/rest/v1/jobs?provider_id=is.null&status=in.(created,bidding)` must return
   `[]`. A non-empty result means the lockout is not actually enforced.
5. From that same session, confirm the two write paths are shut too — both
   must be refused, not silently accepted:
   ```
   POST  /rest/v1/bids   {"job_id":"<an open job>","provider_id":"<self>","amount":1}
   PATCH /rest/v1/jobs?id=eq.<a job assigned to them>   {"business_id":null,"tech_share":null}
   ```
   The first is the bid route back into the pool; the second is the one that
   would let a technician walk out of their dispatcher mid-job and take
   Karighar's commission bill with them.
6. Take one dispatched job all the way to `paid`, then confirm in
   `/admin/settlements` that the **business** owes the commission and the
   technician owes nothing — and that `/business/earnings` shows the
   technician holding the business's share, which drops when you record it
   as received.
