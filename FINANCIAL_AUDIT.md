# KARIGHAR — Financial security audit

**Scope:** `src/`, `supabase/schema.sql`, 20 patch files
**Model:** cash on delivery, no payment gateway
**Findings:** 2 × P0 · 3 × P1 · 3 × P2
**Method:** static analysis of committed source — see [Caveat](#caveat-what-was-verified) before acting
**Status:** P0-1, P0-2, P1-3, P1-4, P1-5, P2-6, P2-7 and P2-8 addressed by
`supabase/patch_v21_financial_integrity.sql` — **not yet applied to any database.**
See [Remediation](#remediation) at the end.

> **Headline.** A signed-in customer can fabricate a completed, paid job against any approved
> technician, creating a real commission debt for work that never happened.

---

## 0. Read this first: four of the eight requested categories do not apply

There is no payment gateway. `payment_method` is an enum of exactly one value, `'cod'`. No Stripe,
no JazzCash, no webhooks, no processor, no escrow. **The platform never holds customer money at any
point.**

So gateway bypass, duplicate charges, webhook replay, chargebacks and database-versus-gateway
reconciliation have no surface here — not because they are handled, but because the machinery does
not exist.

One consequence is worth stating plainly, because the schema's own vocabulary misleads:

> **There are no outbound payouts.** The `'payout'` value in `ledger_type` does not mean Karighar
> paying a technician. It means a technician *remitting commission to Karighar* — money flowing the
> opposite direction to what the word normally implies.

"Payout fraud" in the usual sense (duplicate withdrawals, payouts exceeding collected funds,
unauthorised withdrawal requests) cannot occur, because there is no outbound rail. The equivalent
risk in this model is the inverse: **commission that is never collected** (see P2-8).

---

## 1. Where the money actually goes

Reconstructed from `jobs_enforce_insert`, `jobs_on_paid`, `record_settlement` and
`business_settle_with_tech`.

### Independent technician

```
  Customer ──── cash, in hand ────▶ Technician ┄┄┄ owes 20% / 15% ┄┄▶ Karighar
```

### Dispatched by a business

```
  Customer ─ cash ─▶ Technician ┄ rest ┄▶ Business ┄ commission ┄▶ Karighar
                     (keeps tech_share)
```

- `────` solid: cash moving hand to hand, **outside the system entirely**
- `┄┄┄┄` dashed: a debt recorded in `provider_ledger` and settled off-platform

**The platform is never a custodian of funds.** `provider_ledger` is a record of *debts*, not of
held balances. `netEarnings` is notional — the technician already holds that cash.

### How a price is set

| Job type | At insert | Later |
|---|---|---|
| `fixed` | `price` derived from `services.base_price`, `commission_rate` forced to `0.20`, client value ignored | immutable (`jobs_lock_price`) |
| `custom` | `price` forced to `null`, `commission_rate` forced to `0.15` | set once, by the customer awarding a bid **or** by the pro on site (patch_v19) |

Insert-time derivation is sound — `jobs_enforce_insert` overrides whatever the client sends.
`jobs_stamp_business` freezes `commission_rate` against non-admin updates.

---

## 2. Does it reconcile?

A Rs 2,000 quote job, 15% commission, 70/30 split, traced through `jobs_on_paid` as written:

| Identity | Expected | As coded | Verdict |
|---|---|---|---|
| Cash collected = sum of the two legs | 2,000 | tech 1,400 + business 600 | ✅ balances |
| Technician + business net + commission | 2,000 | 1,400 + 300 + 300 | ✅ balances |
| Commission rows per paid job | exactly 1 | 1 in each branch | ✅ balances |
| Rounding | no drift | `biz_cut = amt − tech_cut`, not re-rounded | ✅ exact |
| Technician owes Karighar on dispatched work | 0 | 0 — commission sits on the business | ✅ correct |
| Refunded job reverses the ledger | reversal rows | no mechanism exists | ❌ **diverges** |
| Settlement cannot exceed what is owed | capped | uncapped, silently clamped in the UI | ❌ **diverges** |
| `payments` reconciles to `provider_ledger` | checked | never compared; table is write-only | ❌ **unchecked** |

**The arithmetic itself is sound and unit-tested. What fails is everything *around* the arithmetic:
nothing reverses, nothing caps, nothing reconciles.**

---

## 3. Findings

### P0-1 — A customer can fabricate a completed, paid job against any technician

Three independent gaps compose into one unbounded fraud. **This is the finding that blocks launch.**

**Location**

- `supabase/schema.sql:1403` — policy `jobs_update_customer`
- `supabase/schema.sql:676` — `jobs_enforce_status()`
- `supabase/schema.sql:650` — `jobs_lock_price()`
- Fields: `jobs.provider_id`, `jobs.price`, `jobs.status`

**Root cause.** RLS here is row-level, and the customer's update policy constrains exactly one
column:

```sql
create policy jobs_update_customer on jobs for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
-- nothing restricts provider_id, price or status
```

`jobs_enforce_status()` validates which *transition* is legal but never *who* is making it — there
is no `auth.uid()` test in it beyond the admin bypass. And `jobs_lock_price()`'s arrival rule is
keyed on `auth.uid() = new.provider_id`, which deliberately exempts the customer so they can award
a bid — so the customer may set any first price. **No trigger anywhere checks that an awarded price
matches a real row in `bids`.**

**Exploit** (ordinary customer, anon key only):

1. Create a custom job normally. It lands at `status='bidding'`, `price=null`.
2. Read any approved technician's id from `public_provider_profiles` — granted to `anon`.
3. `PATCH /rest/v1/jobs?id=eq.<job>` with
   `{"provider_id":"<them>","price":1,"status":"assigned"}`.
   The technician is now assigned, at a price they never quoted, without consenting.
4. Walk the job alone: `en_route` → `arrived` → `in_progress` → `completed` → `paid`.
   Every transition is legal and none checks the actor.
5. `jobs_on_paid` fires and books a commission debt against that technician.

Repeat against every technician in the directory. Raise `price` instead of lowering it to maximise
the fabricated debt.

**Impact.** Unbounded and self-serve. Each run writes a real commission liability against a real
technician for work that never happened, and `/admin/settlements` presents it as collectable.
Inverted, it under-prices genuine work: accept a Rs 8,000 quote, write `price: 500`, and the
technician is bound to the lower figure while Karighar's commission is computed on the fabricated
base.

**Who bears the loss:** the **technician** (billed for phantom work, or paid a fraction of the
agreed quote) and **Karighar** (books carry fictitious receivables; genuine commission understated).

**Evidence.** Policy and trigger text above, read from the committed schema. The absence of bid
validation is positively verified: the only reference to `bids` outside its own table is in
`public_provider_profiles`, and none of the seven triggers on `jobs` consults it.

**Fix.** A `before update` trigger on `jobs` that, when the writer is the customer, refuses a
`provider_id`/`price` write unless a matching pending bid exists, and refuses actor-inappropriate
status moves:

```sql
if auth.uid() = new.customer_id and not is_admin() then
  -- awarding a bid: the pair must exist, at that exact amount
  if new.provider_id is distinct from old.provider_id
     or new.price is distinct from old.price then
    if not exists (select 1 from bids b
                   where b.job_id = new.id and b.provider_id = new.provider_id
                     and b.amount = new.price and b.status = 'pending') then
      raise exception 'That quote is not on offer for this job';
    end if;
  end if;
  -- a customer may cancel, confirm payment and rate. Nothing else.
  if new.status is distinct from old.status
     and new.status not in ('assigned','cancelled','paid','rated','disputed') then
    raise exception 'Only the assigned pro can move a job to %', new.status;
  end if;
end if;
```

Do the mirror for the provider: they may move `en_route` → `completed`, never `paid`.

**Regression test.** SQL run as a customer JWT: assert each of the four writes raises — assigning a
non-bidding provider; awarding at an amount no bid carries; jumping `assigned` → `completed`; and
the full walk to `paid`. Then assert the legitimate path still passes: award a real pending bid at
its exact amount, and confirm `payments` gains exactly one row at that amount.

---

### P0-2 — The product promises refunds; the ledger has no way to issue one

Not an attack — a guaranteed, recurring divergence that starts with your first unhappy customer.

**Location**

- `src/components/kg/ReportSheet.tsx:100` and `src/app/support/mobile.tsx:30` both promise
  "a re-visit or a refund"
- `supabase/schema.sql` — the `disputes` table has no financial effect anywhere; no code in the
  repository writes a reversal

**Root cause.** Grepping the entire codebase for refund logic returns only those two marketing
strings. `jobs_lock_price()` makes price immutable once set, `jobs_enforce_status` has no path out
of `disputed` except an admin override, and no `ledger_type` value is ever written to reverse an
earning or a commission. A dispute resolved in the customer's favour changes a `text` column and
nothing else.

**Impact.** Every refund must be settled in cash off-platform while the ledger continues to assert
the original position. The technician still owes commission on money they handed back. Karighar's
revenue is overstated by the full commission on every refunded job, with no record that a reversal
occurred. The divergence is permanent and compounds — no later process reconciles it.

**Who bears the loss:** the **technician** first, and **Karighar's books** continuously.

**Evidence.** Verified by exhaustive search across `src/` and `supabase/`: no occurrence of refund,
reversal, credit-note or negative-adjustment logic. `ledger_type` carries an `'adjustment'` value
that nothing writes.

**Fix.** An admin-gated reversal RPC tied to a dispute, writing symmetric `'adjustment'` rows that
invert the original job's entries — capped at what that job actually booked, and idempotent per job
so a dispute reopened twice cannot reverse twice. `summarizeLedger` already counts `'adjustment'`
toward `settled`, so a reversal correctly reduces `commissionOwed` with no further app changes.

**Regression test.** Pay a job, assert the ledger; reverse it, assert every leg nets to zero and
`commissionOwed` returns to its pre-job value; call the reversal a second time and assert it is
refused rather than doubling.

---

### P1-3 — `record_settlement` accepts any amount, and the UI hides the overshoot

**Location**

- `supabase/schema.sql:868` — `record_settlement(uuid, numeric)`
- `src/lib/money.ts` — `summarizeLedger`
- `src/app/admin/settlements/page.tsx:55` — the amount field is free text

**Root cause.** The function checks only `p_amount > 0` and `is_admin()`. Nothing compares it to
what is outstanding. `summarizeLedger` then computes `commissionOwed: Math.max(0, gross − settled)`
— so recording Rs 500,000 against a Rs 5,000 debt shows as a clean zero rather than a Rs 495,000
credit. The over-settlement is invisible in every screen.

**Impact.** A rogue or compromised admin account can extinguish arbitrary commission debt with no
visible trace, and the clamp means routine review will never surface it. Requires admin access,
which is why this is P1 rather than P0 — but admin is granted with a one-line SQL update today.

**Who bears the loss:** **Karighar**.

**Evidence.** Function body and the `Math.max(0, …)` clamp, both quoted from source. Confirmed no
other caller validates the amount.

**Fix.** Compute the outstanding balance inside the function and refuse an amount exceeding it;
surface a true signed balance in the UI instead of clamping, so any historical overshoot becomes
visible rather than absorbed.

**Regression test.** Assert a settlement of `owed + 0.01` raises; assert exactly `owed` succeeds and
leaves the balance at zero; assert a pre-existing negative balance renders as a credit, not zero.

---

### P1-4 — A business can write ledger rows against a technician who never joined it

**Location**

- `supabase/schema.sql:1164` — `business_settle_with_tech`
- `supabase/schema.sql` — `business_invite_technician`

**Root cause.** The membership test is existence-only:

```sql
if not exists (select 1 from business_members m
               where m.business_id = biz and m.provider_id = p_provider) then
-- no m.status check: 'invited', 'declined' and 'removed' all pass
```

and `business_invite_technician` creates an `'invited'` row with no consent from the technician. So
any active business can mint a membership row against any approved technician and then write ledger
entries referencing them. The amount is also uncapped.

**Impact.** Corrupts the audit trail rather than moving money directly: the technician's ledger
acquires `business_share` rows from a company they declined, and the business's own receivable is
falsified. Because the rows are mirrored, the business mostly defrauds itself — but any future
reconciliation, dispute or payout logic built on this ledger inherits bad data.

**Who bears the loss:** the **technician's records**, and the integrity of the ledger as a whole.

**Evidence.** Both function bodies read from source; the missing `m.status` predicate is positively
confirmed.

**Fix.** Require `m.status = 'active'`, and cap `p_amount` at the technician's outstanding
`business_share` balance with that business.

**Regression test.** Invite without accepting, assert settlement raises; accept, assert it succeeds;
attempt an amount above outstanding, assert it raises.

---

### P1-5 — Double-payment protection is a read-then-write with no unique constraint

**Location**

- `supabase/schema.sql:256` — `payments.job_id` has a foreign key but **no unique index**
- `supabase/schema.sql:773` — `jobs_on_paid()`

**Root cause.** The sole defence against a second payment row and a duplicate set of ledger entries
is `if exists (select 1 from payments where job_id = new.id) then return new;` — a check-then-act
with no constraint behind it.

**Impact.** In practice the trigger's `when (new.status = 'paid' and old.status is distinct from
'paid')` clause plus row-level locking serialises concurrent transitions, so **no working
double-book could be constructed. Label this defence-in-depth, not a demonstrated exploit.** It
matters because the admin override can move `disputed` → `paid`, re-entering the trigger, and
because any future code path that writes `payments` inherits no protection.

**Evidence.** Absence of a unique constraint confirmed by inspection. Exploitability
**UNVERIFIED**.

**Fix.** `alter table payments add constraint payments_one_per_job unique (job_id);` and change the
guard to `on conflict (job_id) do nothing` so the database, not a read, is the authority.

**Regression test.** Insert two payment rows for one job directly; assert the second violates the
constraint.

---

### P2-6 — No sign or range constraint on `jobs.price`

**Location:** `supabase/schema.sql` — `jobs.price numeric(10,2)`, no CHECK.

**Impact.** An on-site technician can write a negative price, producing a negative earning and an
inverted commission row. `summarizeLedger` takes `Math.abs` of commission, so the result is
incoherent rather than profitable — accounting corruption, not theft. The client-side `value > 0`
check in `/pro/jobs/view` is not a control.

**Fix.** `check (price is null or price >= 0)`, plus an upper sanity bound.

**Regression test.** Assert a negative and a zero price are both refused at the database.

---

### P2-7 — `payments` is write-only; nothing ever reconciles it

**Location:** no occurrence of `from("payments")` anywhere in `src/`.

**Impact.** The table records `amount`, `commission` and `provider_payout` per job, and no screen or
job ever compares those totals to `provider_ledger`. If the two diverge — through the admin
override, a future migration, or a partially-applied patch — nothing detects it. There is currently
no answer to "does the ledger agree with the payment record?"

**Fix.** An admin reconciliation view asserting, per period, that `Σ payments.commission` equals
`Σ |ledger.commission|` and that every `paid` job has exactly one payment row. Cheap to build, and
the thing that would have caught several findings above.

**Regression test.** A SQL assertion in CI against seeded data: zero orphan paid jobs, zero duplicate
payment rows, commission totals equal.

---

### P2-8 — Revenue leakage: nothing compels the transition to `paid`

**Location:** `jobs_enforce_status` — `completed` is a terminal state unless someone chooses to
advance it.

**Impact.** Commission is only ever booked by `jobs_on_paid`. A customer and technician who settle
in cash and simply leave the job at `completed` pay Karighar nothing, and no report surfaces it.
This is inherent to a cash model rather than a defect, but it is unmonitored: there is no aging view
of completed-but-unpaid work.

**Who bears the loss:** **Karighar**, silently and at whatever rate collusion occurs.

**Fix.** An admin view of jobs sitting at `completed` beyond N days, and a prompt to both parties.
Longer term this is the argument for moving off pure COD.

**Regression test.** Not a code defect; monitor as a business metric.

---

## Caveat: what was verified

Every finding above is derived from the committed schema and application source — policy text,
trigger bodies and RLS definitions, quoted directly. That evidence is unambiguous for the
authorisation findings: a policy that constrains only `customer_id` cannot constrain `price`.

**No exploit was executed against a live database.** Email confirmation is enabled on the project
and the seeded demo accounts do not exist there, so no authenticated session could be obtained to
run the proofs — and write tests would not have been run against production data in any case. The
exploit sequences are therefore **derived, not demonstrated**.

P0-1 in particular should be reproduced on a staging copy before and after the fix; the reproduction
steps are written to be run exactly as given. P1-5 is explicitly labelled unverified in its own
right.

---

## Action plan

| # | Action | Finding |
|---|---|---|
| 1 | **Close the customer write surface on `jobs`.** One trigger: validate awarded price against a real pending bid, and restrict status transitions by actor. This single change removes the fabrication, the unauthorised assignment and the quote manipulation together. | P0-1 |
| 2 | **Restrict who may set `paid`.** Decide deliberately whether the customer confirms payment, the technician confirms receipt, or both are required — then enforce it in the trigger rather than leaving it to whichever client calls first. | P0-1 |
| 3 | **Build the reversal path.** An admin-gated, idempotent, per-job capped reversal writing `'adjustment'` rows. Until this exists, every refund honoured silently misstates the books. | P0-2 |
| 4 | **Cap both settlement RPCs and stop clamping the display**, plus require an active membership. Small changes; they turn the ledger from advisory into authoritative. | P1-3, P1-4 |
| 5 | **Add the database constraints:** `unique (job_id)` on `payments`, non-negative check on `jobs.price`. One-line migrations that make a class of future mistake impossible. | P1-5, P2-6 |
| 6 | **Build the reconciliation view.** The cheapest lasting protection here — a single admin screen that would have surfaced most of this list without an audit. | P2-7 |
| 7 | **Monitor stranded `completed` jobs.** A metric, not a fix — but you cannot price the leakage until you can see it. | P2-8 |

### Gate for real customer transactions

**Items 1–3 are not optional hardening.** They are the difference between a ledger that records
reality and one that records whatever a browser console asserts.

Items 4 and 5 should land in the same release — they are small, and they protect the fixes above
from regression. Item 6 can follow within the first operating week. Item 7 is ongoing.

Nothing in this audit requires moving off cash on delivery. It does require accepting that with no
gateway, **your database is the only record of money that exists** — which is precisely why its
write paths have to be as strict as a payment processor's would be.


---

## Remediation

`supabase/patch_v21_financial_integrity.sql` (folded into `schema.sql`) closes the findings above.
**It has not been run against any database yet** — applying it is step one of the action plan.

| Finding | Closed by |
|---|---|
| P0-1 | `jobs_guard_actor()` — a new `before update` trigger on `jobs`. The customer branch requires a live row in `bids` matching both the provider *and* the exact amount before `provider_id`/`price` may move, and restricts the customer to `assigned`/`cancelled`/`paid`/`rated`/`disputed`. The pro branch restricts them to the work transitions and blocks `rated`. `auth.uid() is null` passes through untouched, so the service role, the seed scripts and SECURITY DEFINER RPCs such as `business_assign_job` are unaffected. |
| P0-2 | `reverse_job_charges(job, reason)` — admin-gated, idempotent per job, derived from the `payments` row rather than recomputed from the job so it mirrors exactly what was booked. Commission is cancelled with an `'adjustment'` row, not a positive `'commission'` row, because `summarizeLedger` takes `abs()` of commission and the latter would *add* to the gross. Marks the payment `'refunded'` and appends the reason to the dispute. Surfaced as **Reverse charges** on `/admin/disputes`. |
| P1-3 | `record_settlement` now computes `commission_outstanding()` and refuses anything above it. `summarizeLedger` gained a signed `commissionBalance` alongside the clamped `commissionOwed`, so a historical overshoot reads as a credit instead of a clean zero. |
| P1-4 | `business_settle_with_tech` now requires `m.status = 'active'` and caps at `business_share_outstanding()`. |
| P1-5 | `unique (job_id)` on `payments`; `jobs_on_paid` switched to `on conflict (job_id) do nothing` with `GET DIAGNOSTICS`, so the database is the authority rather than a read-then-write. Pre-existing duplicates are collapsed to the earliest row by the patch. |
| P2-6 | `check (price is null or price >= 0)` on `jobs`. |
| P2-7 | `admin_reconciliation()` — a function, not a view, so it can be gated on `is_admin()`. Compares `payments.commission` against ledger commission net of reversals, and counts paid-jobs-without-a-payment-row and duplicate payments. Shown at the top of `/admin/settlements`. |
| P2-8 | The same function reports jobs stranded at `completed` for more than three days, and their value. |

### Still open

- **Applying the patch.** Nothing above is live until `patch_v21` is run.
- **Reproducing P0-1 on staging**, before and after, using the steps in the finding. The fix is
  reasoned from the policy text, not demonstrated against a running database.
- **Duplicate ledger rows from any historical duplicate payment.** The patch collapses duplicate
  `payments` rows but deliberately does not delete ledger entries — that would be destroying
  financial records. If `commission_delta` is non-zero on the reconciliation panel after applying,
  that is why, and it needs a human decision rather than a migration.
