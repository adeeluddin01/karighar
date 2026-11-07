// KARIGHAR — email notifications Edge Function (SCAFFOLD, deploy Monday)
// Sends an email when a row is inserted into `notifications`.
//
// Wire-up (once you have a Resend account):
//   1. supabase secrets set RESEND_API_KEY=re_xxx
//   2. supabase secrets set NOTIFY_WEBHOOK_SECRET=$(openssl rand -hex 32)
//   3. supabase functions deploy send-notification-email
//   4. Supabase Dashboard → Database → Webhooks → create webhook:
//        table: notifications, events: INSERT, type: HTTP Request,
//        URL: https://<project>.functions.supabase.co/send-notification-email
//        HTTP header: x-webhook-secret: <the value from step 2>
//
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// SECURITY — why this file looks the way it does.
//
// This function holds the SERVICE ROLE KEY and will email anyone it is told
// to. Three things therefore have to be true, and none of them were:
//
//  1. It must verify the caller. It was deployed `--no-verify-jwt` and read
//     `payload.record` straight off an unauthenticated request body, so
//     anyone who learned the URL could email any registered user arbitrary
//     content from noreply@thekarighar.com. `--no-verify-jwt` is still
//     required (a database webhook sends no user JWT), so the check is a
//     shared secret in a header instead, compared in constant time.
//  2. It must not trust the row's text. `title`/`body` were interpolated
//     raw into HTML. They are built by notify_user(), which until patch_v27
//     was executable by `anon` — so that text was attacker-reachable, and
//     an <a> or <img> in it would render in the email.
//  3. It must not reflect internals. The catch-all returned
//     `"error: " + e.message` to the caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** HTML-escape text destined for an email body. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Length-independent string compare.
 *
 * A plain `!==` leaks the position of the first differing byte through
 * timing, which is enough to recover a secret one byte at a time.
 */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    // 1. Authenticate the webhook before reading anything from the body.
    const expected = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
    if (!expected) {
      // Fail closed. An unset secret used to mean "accept everything".
      console.error("NOTIFY_WEBHOOK_SECRET is not set — refusing to send");
      return new Response("not configured", { status: 503 });
    }
    const presented = req.headers.get("x-webhook-secret") ?? "";
    if (!safeEqual(presented, expected)) {
      return new Response("forbidden", { status: 403 });
    }

    const payload = await req.json();
    const n = payload?.record; // the inserted notification row
    if (!n?.user_id) return new Response("no user", { status: 200 });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return new Response("email disabled (no key)", { status: 200 });

    // Resolve the recipient's email via the admin API.
    const admin = createClient(
      Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: userRes } = await admin.auth.admin.getUserById(n.user_id);
    const email = userRes?.user?.email;
    if (!email) return new Response("no email", { status: 200 });

    // Subject goes in a header, so strip anything that could start a new one.
    const subject = String(n.title ?? "KARIGHAR update").replace(/[\r\n]+/g, " ").slice(0, 200);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "KARIGHAR <noreply@thekarighar.com>",
        to: email,
        subject,
        html: `<p>${escapeHtml(n.title)}</p><p>${escapeHtml(n.body)}</p>
               <p><a href="https://thekarighar.com/bookings">Open KARIGHAR</a></p>`,
      }),
    });
    return new Response(res.ok ? "sent" : "resend error", { status: 200 });
  } catch (e) {
    // Logged, not returned: the caller gets no detail about our internals.
    console.error("send-notification-email failed:", e);
    return new Response("error", { status: 200 });
  }
});
