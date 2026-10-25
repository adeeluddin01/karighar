// Deploys KARIGHAR to Vercel (production).
// Prereq: put a Vercel token in .env.local as VERCEL_TOKEN=...
// Run: node --env-file=.env.local scripts/deploy.mjs
import { spawnSync } from "node:child_process";

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("Missing VERCEL_TOKEN in .env.local (create one at https://vercel.com/account/tokens)");
  process.exit(1);
}

// Only the vars the running app actually needs (all public / non-secret).
//
// NEXT_PUBLIC_SITE_URL is deliberately NOT hardcoded here. src/lib/siteUrl.ts
// only uses it to override the browser's own origin — if it's set to a
// domain that isn't actually serving this deployment (e.g. a custom domain
// still pointed at a different host), every Google OAuth redirect silently
// breaks, because it gets built against a domain that never sees the
// request. Leaving this unset makes the app correctly detect whatever origin
// is actually live (the *.vercel.app URL, a preview URL, or a verified
// custom domain) with no further changes needed.
//
// Set DEPLOY_SITE_URL before running this script only once a real custom
// domain is confirmed live and pointed at this Vercel project — and make
// sure Supabase's Redirect URLs allow-list is updated to match first.
const SITE_URL = process.env.DEPLOY_SITE_URL || "";
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_SITE_URL: SITE_URL,
};

const PROJECT = "karighar";
const vercel = (args, input) =>
  spawnSync("npx", ["vercel", ...args, "--token", TOKEN], {
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input,
    shell: process.platform === "win32",
    encoding: "utf8",
  });

console.log("→ Linking/creating Vercel project…");
vercel(["link", "--yes", "--project", PROJECT]);

console.log("→ Setting environment variables (production)…");
for (const [name, value] of Object.entries(ENV)) {
  if (!value) { console.warn(`  skip ${name} (empty)`); continue; }
  vercel(["env", "rm", name, "production", "--yes"]); // ignore if absent
  const r = vercel(["env", "add", name, "production"], value + "\n");
  console.log(`  ${name}: ${r.status === 0 ? "set" : "FAILED"}`);
}

console.log("→ Deploying to production…");
const dep = vercel(["deploy", "--prod", "--yes"]);
process.exit(dep.status ?? 0);
