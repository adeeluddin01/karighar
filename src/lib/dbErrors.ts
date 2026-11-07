/* ============================================================
   Postgres errors, in words a customer can act on.

   Every write in this app goes from the browser straight to Supabase, so the
   only error object a form ever sees is a PostgrestError. Those were being
   toasted verbatim, which meant a failed save showed people things like
   'new row for relation "jobs" violates check constraint
   "jobs_title_len"' — it names our tables, our constraints and our policies,
   and it tells the user nothing about what to do next.

   This maps the handful of codes a client can actually provoke onto a
   sentence, in the same shape as authErrorMessage() in ./authActions.

   The raw message is still appended in development, because losing it while
   debugging a new constraint would be worse than the leak it causes in
   production.
   ============================================================ */

/** The shape of a Supabase/PostgREST error, loosely — we only need these. */
type DbError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * Per-constraint copy, keyed by the constraint name in the error.
 *
 * Keys must match the names used in supabase/patch_v27_input_integrity.sql.
 * A constraint with no entry here falls back to the generic length/range
 * wording for its SQLSTATE, which is still better than the raw message.
 */
const CONSTRAINT_COPY: Record<string, string> = {
  jobs_title_len: "That job title is too long. Please shorten it.",
  jobs_description_len: "That description is too long. Please shorten it.",
  jobs_address_len: "That address is too long. Please shorten it.",
  jobs_price_non_negative: "A price can't be negative.",
  jobs_proposed_price_non_negative: "A proposed price can't be negative.",
  jobs_commission_rate_range: "That commission rate is out of range.",
  messages_text_len: "That message is too long. Please shorten it.",
  disputes_reason_len: "That description is too long. Please shorten it.",
  disputes_status_valid: "That isn't a valid dispute status.",
  profiles_full_name_len: "That name is too long. Please shorten it.",
  providers_bio_len: "That bio is too long. Please shorten it.",
  providers_cnic_len: "Enter a valid 13-digit CNIC.",
  reviews_comment_len: "That review is too long. Please shorten it.",
  customer_reviews_comment_len: "That review is too long. Please shorten it.",
  bids_amount_positive: "Enter a bid amount greater than zero.",
  bids_note_len: "That note is too long. Please shorten it.",
  services_base_price_non_negative: "A price can't be negative.",
  services_visit_fee_non_negative: "A visit fee can't be negative.",
  payments_amounts_non_negative: "A payment amount can't be negative.",
};

/** Pull the constraint name out of a Postgres message, if it names one. */
function constraintOf(error: DbError): string | null {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const m = /constraint "([a-z0-9_]+)"/i.exec(text);
  return m ? m[1] : null;
}

/**
 * What to show the user for a failed Supabase write.
 *
 * Always returns a non-empty sentence — a form that shows nothing on failure
 * reads as "my click did nothing", which is the bug this is here to avoid.
 */
export function dbErrorMessage(error: DbError | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";

  const named = constraintOf(error);
  let text: string;

  if (named && CONSTRAINT_COPY[named]) {
    text = CONSTRAINT_COPY[named];
  } else {
    switch (error.code) {
      case "23514": // check_violation
        text = "One of those values isn't allowed. Please review and try again.";
        break;
      case "23505": // unique_violation
        text = "That has already been recorded.";
        break;
      case "23503": // foreign_key_violation
        text = "That item no longer exists. Refresh and try again.";
        break;
      case "23502": // not_null_violation
        text = "Something required is missing. Please fill in every field.";
        break;
      case "22001": // string_data_right_truncation
        text = "That text is too long. Please shorten it.";
        break;
      case "22003": // numeric_value_out_of_range
        text = "That number is too large.";
        break;
      case "42501": // insufficient_privilege — an RLS denial
      case "PGRST301":
        text = "You don't have permission to do that.";
        break;
      case "P0001": // raise_exception — our own triggers' messages
        // These are written for people (e.g. "A job cannot be unassigned"),
        // so the trigger's own wording is the best available copy.
        text = error.message?.trim() || "That action isn't allowed right now.";
        break;
      case "PGRST116":
        text = "That item couldn't be found.";
        break;
      default:
        text = "Something went wrong. Please try again.";
    }
  }

  if (process.env.NODE_ENV !== "production" && error.message) {
    return `${text} [dev: ${error.message}]`;
  }
  return text;
}
