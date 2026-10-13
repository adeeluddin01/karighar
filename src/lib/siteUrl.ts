import { BRAND } from "./config";

/* ============================================================
   Canonical origin + path helpers.

   Two problems live here.

   1. `next.config.ts` sets `trailingSlash: true`, so the export is
      `auth/callback/index.html`. A link to `/auth/callback?next=…` gets a 301
      from the host, and both Supabase's redirect allow-list comparison and
      some mod_rewrite configs drop the query string on the way. Every
      internal path we hand to Supabase therefore has to carry its slash
      *before* the `?`.

   2. `supabase.auth.signUp()` without `emailRedirectTo` makes GoTrue build the
      confirmation link from the dashboard's Site URL — which is why the
      confirmation email pointed at localhost. We now always send one.
   ============================================================ */

function stripTrailing(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * The origin to build absolute auth links from, without a trailing slash.
 *
 * Order matters:
 *  1. `NEXT_PUBLIC_SITE_URL` — lets a build pin the canonical domain.
 *  2. The live browser origin — always right for the person signing up, and
 *     right in dev.
 *  3. `BRAND.siteUrl` — for prerender/metadata, where there is no window.
 *
 * `BRAND.siteUrl` deliberately sits *below* the browser origin: above it, a
 * local dev signup would email a link to the production domain, which is a
 * worse bug than the one this fixes.
 */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return stripTrailing(env);
  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailing(window.location.origin);
  }
  return stripTrailing(BRAND.siteUrl);
}

/**
 * Give an app path its trailing slash, keeping any query/hash after it:
 * `/pro/onboarding` -> `/pro/onboarding/`, `/b/view?id=1` -> `/b/view/?id=1`.
 */
export function withSlash(path: string): string {
  if (!path) return "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const [, base, rest = ""] = /^([^?#]*)([?#].*)?$/.exec(normalized)!;
  const dir = !base || base === "/" ? "/" : base.endsWith("/") ? base : `${base}/`;
  return dir + rest;
}

/**
 * Absolute URL of the auth callback, for `emailRedirectTo` and OAuth
 * `redirectTo`. `next` is where to land once the session exists.
 */
export function authRedirect(next = "/"): string {
  return `${siteUrl()}/auth/callback/?next=${encodeURIComponent(withSlash(next || "/"))}`;
}
