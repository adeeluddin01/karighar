import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePkPhone } from "./validate";
import { authRedirect } from "./siteUrl";

/* ============================================================
   The auth calls, in one place.

   The same email/password sign-up and sign-in logic was written out three
   times — the desktop form, the phone form and the in-place booking gate —
   which is how all three ended up missing `emailRedirectTo` and how the role
   came to be dropped on a confirmed-email signup. Components keep their own
   markup and state; the Supabase calls live here.
   ============================================================ */

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  asProvider?: boolean;
};

export type SignUpResult =
  | { kind: "session"; userId: string }
  | { kind: "confirm-email" }
  | { kind: "error"; message: string };

/**
 * Create an account.
 *
 * Two things that used to go wrong:
 *
 * - `emailRedirectTo` was never sent, so GoTrue built the confirmation link
 *   from the dashboard's Site URL — which is why the email pointed at
 *   localhost. (The URL must also be on the project's Redirect URLs
 *   allow-list, or GoTrue silently falls back to Site URL anyway.)
 * - The chosen role was only written *after* sign-up, by updating `profiles`.
 *   With email confirmation on there is no session yet, so that update never
 *   ran and the role — along with the name and phone — was lost. They now
 *   travel in user metadata, and `handle_new_user()` applies them when the
 *   account is created.
 */
export async function signUpWithEmail(
  supabase: SupabaseClient,
  input: SignUpInput,
  next = "/"
): Promise<SignUpResult> {
  const normPhone = normalizePkPhone(input.phone);
  if (!normPhone) {
    return {
      kind: "error",
      message: "Enter a valid Pakistani mobile number, e.g. 0300 1234567",
    };
  }

  const role = input.asProvider ? "provider" : "customer";
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: authRedirect(next),
      data: { full_name: input.fullName, phone: normPhone, role },
    },
  });

  if (error) return { kind: "error", message: error.message };

  // No session means a confirmation email is on its way; the DB trigger owns
  // the profile fields until the user comes back through /auth/callback/.
  if (!data.session) return { kind: "confirm-email" };

  // Signed in straight away (confirmation disabled). The trigger has already
  // written these, but it cannot know the role chosen in *this* tab if the
  // metadata round trip was skipped, so keep the explicit write.
  await supabase
    .from("profiles")
    .update({ full_name: input.fullName, phone: normPhone, role })
    .eq("id", data.session.user.id);

  return { kind: "session", userId: data.session.user.id };
}

export async function signInWithEmail(
  supabase: SupabaseClient,
  email: string,
  password: string
) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Start the Google OAuth redirect.
 *
 * The trailing slash matters: with `trailingSlash: true` the export is
 * `auth/callback/index.html`, so `/auth/callback?next=…` takes a 301 that can
 * drop the query string, and the un-slashed form may not match the project's
 * Redirect URLs allow-list either.
 */
export async function startGoogleOAuth(supabase: SupabaseClient, next = "/") {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authRedirect(next) },
  });
}

/**
 * Human text for an `?error=` code handed back by /auth/callback/. Nothing
 * used to read that param at all, so a failed sign-in just redisplayed an
 * empty form with no explanation.
 */
export function authErrorMessage(code: string): string {
  switch (code) {
    case "oauth_denied":
    case "access_denied":
      return "Sign-in was cancelled. Try again, or use your email and password.";
    case "link_expired":
      return "That confirmation link has expired. Sign in to have a new one sent.";
    case "wrong_browser":
      return "Open the link in the browser you signed up in — or just sign in with your password below.";
    case "no_credentials":
      return "That sign-in link was incomplete. Please try again.";
    case "oauth":
      return "We couldn't finish signing you in. Please try again.";
    default:
      return "We couldn't finish signing you in. Please try again.";
  }
}

/** The signup confirmation notice. */
// Deliberately neutral about whether the address was already registered:
// Supabase returns a decoy user with no error for an existing email, so
// saying "account created" would leak which addresses have accounts.
export const CONFIRM_EMAIL_NOTICE =
  "Almost there — if that address is new, we've sent it a confirmation link. Open it to finish signing up.";
