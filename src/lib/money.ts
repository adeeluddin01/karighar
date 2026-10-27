// Pure money/accounting helpers — no React, so they're unit-testable.

export function formatPKR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "On quote";
  return "Rs " + Number(amount).toLocaleString("en-PK");
}

export function commissionFor(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

export function providerPayout(amount: number, rate: number): number {
  return Math.round((amount - commissionFor(amount, rate)) * 100) / 100;
}

export type LedgerType = "earning" | "commission" | "payout" | "adjustment" | "business_share";

export type LedgerEntry = { type: LedgerType; amount: number };

export type LedgerSummary = {
  netEarnings: number; // what the Pro keeps (payout portion)
  commissionGross: number; // total commission generated
  settled: number; // commission already remitted to the platform
  commissionOwed: number; // outstanding commission the Pro owes KARIGHAR
  /**
   * The same figure, SIGNED. `commissionOwed` clamps at zero so the screens
   * never show a negative debt — but that clamp also hid over-settlement: a
   * settlement larger than the balance read as a clean zero rather than a
   * credit. Negative here means more has been remitted or reversed than was
   * ever raised, which should be visible rather than absorbed.
   */
  commissionBalance: number;
  /**
   * The business<->technician leg, which is NOT Karighar's money.
   *
   * Positive on a business (owed TO it by its technicians, who collected the
   * cash on site), negative on a technician (owed BY them to their business).
   * Zero for an independent pro, so every existing total is unchanged.
   */
  businessShareNet: number;
};

// COD model: 'earning' = what this account keeps, 'commission' stored
// negative (always owed to KARIGHAR), 'payout' = a recorded settlement,
// 'business_share' = the technician<->business transfer on a dispatched job.
//
// The exhaustive switch is deliberate. This used to be an if/else chain with
// no default, which silently dropped any new ledger type from every total —
// a money bug with no error. `never` makes the compiler refuse the next one.
export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  let netEarnings = 0;
  let commissionGross = 0;
  let settled = 0;
  let businessShareNet = 0;
  for (const e of entries) {
    switch (e.type) {
      case "earning":
        netEarnings += e.amount;
        break;
      case "commission":
        commissionGross += Math.abs(e.amount);
        break;
      case "payout":
      case "adjustment":
        settled += e.amount;
        break;
      case "business_share":
        businessShareNet += e.amount;
        break;
      default: {
        // Compile-time exhaustiveness: adding a LedgerType without handling
        // it above is a type error on this line. Deliberately does NOT throw
        // at runtime — a value added in SQL ahead of this union would
        // otherwise take /pro/history down to a permanent spinner, which is
        // worse than omitting one row from a total.
        const exhaustive: never = e.type;
        void exhaustive;
        break;
      }
    }
  }
  return {
    netEarnings: Math.round(netEarnings * 100) / 100,
    commissionGross: Math.round(commissionGross * 100) / 100,
    settled: Math.round(settled * 100) / 100,
    commissionOwed: Math.max(0, Math.round((commissionGross - settled) * 100) / 100),
    commissionBalance: Math.round((commissionGross - settled) * 100) / 100,
    businessShareNet: Math.round(businessShareNet * 100) / 100,
  };
}

/**
 * Split a dispatched job's cash the way `jobs_on_paid` does, so the dispatch
 * UI can quote a technician their cut before the work happens and the two
 * numbers always agree.
 *
 * The technician physically collects `price`; `techShare` is the fraction
 * they keep. The business keeps the rest and pays Karighar's commission out
 * of its own side — so the technician owes Karighar nothing.
 */
export function splitDispatchedJob(price: number, techShare: number, commissionRate: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const commission = commissionFor(price, commissionRate);
  const techCut = round(price * techShare);
  const bizCut = round(price - techCut); // what the technician owes the business
  return {
    commission, // business -> Karighar
    techCut, // technician keeps
    bizCut, // technician -> business
    businessNet: round(bizCut - commission), // business keeps after commission
  };
}
