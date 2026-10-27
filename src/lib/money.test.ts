import { describe, it, expect } from "vitest";
import {
  formatPKR,
  commissionFor,
  providerPayout,
  summarizeLedger,
  splitDispatchedJob,
} from "./money";

describe("formatPKR", () => {
  it("formats numbers with Rs prefix", () => {
    expect(formatPKR(1750)).toBe("Rs 1,750");
    expect(formatPKR(0)).toBe("Rs 0");
  });
  it("shows 'On quote' for null/undefined", () => {
    expect(formatPKR(null)).toBe("On quote");
    expect(formatPKR(undefined)).toBe("On quote");
  });
});

describe("commission", () => {
  it("computes 20% commission and payout", () => {
    expect(commissionFor(1750, 0.2)).toBe(350);
    expect(providerPayout(1750, 0.2)).toBe(1400);
  });
  it("computes 15% for custom jobs", () => {
    expect(commissionFor(2000, 0.15)).toBe(300);
    expect(providerPayout(2000, 0.15)).toBe(1700);
  });
});

describe("summarizeLedger", () => {
  it("computes net earnings and outstanding commission", () => {
    const s = summarizeLedger([
      { type: "earning", amount: 1400 },
      { type: "commission", amount: -350 },
      { type: "earning", amount: 1700 },
      { type: "commission", amount: -300 },
    ]);
    expect(s.netEarnings).toBe(3100);
    expect(s.commissionGross).toBe(650);
    expect(s.commissionOwed).toBe(650);
  });

  it("reduces owed commission after a settlement", () => {
    const s = summarizeLedger([
      { type: "commission", amount: -350 },
      { type: "payout", amount: 200 },
    ]);
    expect(s.commissionGross).toBe(350);
    expect(s.settled).toBe(200);
    expect(s.commissionOwed).toBe(150);
  });

  it("never goes negative once over-settled", () => {
    const s = summarizeLedger([
      { type: "commission", amount: -100 },
      { type: "payout", amount: 250 },
    ]);
    expect(s.commissionOwed).toBe(0);
  });

  it("leaves an independent pro's totals untouched by the business field", () => {
    const s = summarizeLedger([
      { type: "earning", amount: 1400 },
      { type: "commission", amount: -350 },
    ]);
    expect(s.businessShareNet).toBe(0);
  });
});

/* The business<->technician leg. These assert the invariant that matters:
   whatever the split, the three legs of a dispatched job add back up to the
   price the customer paid, and Karighar's commission is charged exactly
   once — to the business. */
describe("dispatched jobs (business accounts)", () => {
  it("splits one job between technician, business and Karighar", () => {
    const { commission, techCut, bizCut, businessNet } = splitDispatchedJob(2000, 0.7, 0.2);
    expect(commission).toBe(400); // 20% of 2000, owed by the BUSINESS
    expect(techCut).toBe(1400); // technician keeps 70%
    expect(bizCut).toBe(600); // technician owes the business the rest
    expect(businessNet).toBe(200); // business keeps 600 - 400
    expect(techCut + bizCut).toBe(2000); // the cash collected on site
    expect(techCut + businessNet + commission).toBe(2000);
  });

  it("charges the business, not the technician, in the resulting ledgers", () => {
    const { commission, techCut, bizCut } = splitDispatchedJob(2000, 0.7, 0.2);

    const tech = summarizeLedger([
      { type: "earning", amount: techCut },
      { type: "business_share", amount: -bizCut },
    ]);
    expect(tech.netEarnings).toBe(1400);
    expect(tech.commissionOwed).toBe(0); // owes KARIGHAR nothing
    expect(tech.businessShareNet).toBe(-600); // owes their BUSINESS this

    const biz = summarizeLedger([
      { type: "business_share", amount: bizCut },
      { type: "commission", amount: -commission },
    ]);
    expect(biz.commissionOwed).toBe(400); // what /admin/settlements chases
    expect(biz.businessShareNet).toBe(600); // receivable from the technician
    expect(biz.netEarnings).toBe(0); // a dispatcher has no 'earning' leg
  });

  it("keeps the identity at an awkward share and an odd price", () => {
    const price = 1755;
    const { commission, techCut, bizCut, businessNet } = splitDispatchedJob(price, 0.655, 0.15);
    expect(techCut + bizCut).toBe(price);
    expect(techCut + businessNet + commission).toBe(price);
  });

  it("gives the business everything at a 0% share and the technician everything at 100%", () => {
    const none = splitDispatchedJob(1000, 0, 0.2);
    expect(none.techCut).toBe(0);
    expect(none.bizCut).toBe(1000);

    const all = splitDispatchedJob(1000, 1, 0.2);
    expect(all.techCut).toBe(1000);
    expect(all.bizCut).toBe(0);
    // The business still owes the commission — and is now out of pocket,
    // which is exactly why the dispatch UI shows businessNet.
    expect(all.businessNet).toBe(-200);
  });

  // business_settle_with_tech writes the mirrored pair that discharges the
  // debt. Without it both sides' figures were lifetime totals that could only
  // grow, while the UI labelled them outstanding balances.
  it("nets the technician<->business debt down as cash is handed over", () => {
    const { bizCut } = splitDispatchedJob(2000, 0.7, 0.2);

    const techBefore = summarizeLedger([{ type: "business_share", amount: -bizCut }]);
    expect(techBefore.businessShareNet).toBe(-600);

    // They hand over 250 of the 600.
    const techAfter = summarizeLedger([
      { type: "business_share", amount: -bizCut },
      { type: "business_share", amount: 250 },
    ]);
    expect(techAfter.businessShareNet).toBe(-350);

    // The business's side moves by the same amount, in the same direction.
    const bizAfter = summarizeLedger([
      { type: "business_share", amount: bizCut },
      { type: "business_share", amount: -250 },
      { type: "commission", amount: -400 },
    ]);
    expect(bizAfter.businessShareNet).toBe(350);
    expect(bizAfter.commissionOwed).toBe(400); // settling with a tech does NOT pay Karighar
  });

  it("reaches zero when a technician settles in full, and stays there", () => {
    const paid = summarizeLedger([
      { type: "business_share", amount: -600 },
      { type: "business_share", amount: 600 },
    ]);
    expect(paid.businessShareNet).toBe(0);
    expect(paid.netEarnings).toBe(0);
    expect(paid.commissionOwed).toBe(0);
  });

  it("totals a mixed history: independent work, then attached work", () => {
    const s = summarizeLedger([
      // before joining a business
      { type: "earning", amount: 1400 },
      { type: "commission", amount: -350 },
      // after joining
      { type: "earning", amount: 1400 },
      { type: "business_share", amount: -600 },
    ]);
    expect(s.netEarnings).toBe(2800);
    expect(s.commissionOwed).toBe(350); // only the independent job
    expect(s.businessShareNet).toBe(-600);
  });
});

/* P1-3 from the financial audit: `commissionOwed` clamps at zero, which meant
   a settlement larger than the balance showed as settled-in-full instead of
   as a credit. The signed balance is what makes an overshoot visible. */
describe("over-settlement is visible, not absorbed", () => {
  it("reports a credit when more was remitted than raised", () => {
    const s = summarizeLedger([
      { type: "commission", amount: -350 },
      { type: "payout", amount: 1000 },
    ]);
    expect(s.commissionOwed).toBe(0); // unchanged: screens never show negative debt
    expect(s.commissionBalance).toBe(-650); // but the overshoot is now legible
  });

  it("agrees with commissionOwed whenever nothing is over-settled", () => {
    for (const settled of [0, 100, 350]) {
      const s = summarizeLedger([
        { type: "commission", amount: -350 },
        { type: "payout", amount: settled },
      ]);
      expect(s.commissionBalance).toBe(s.commissionOwed);
    }
  });

  // A reversal books an 'adjustment', which lands in the same `settled`
  // bucket as a remittance — so reversing a job returns the balance to zero.
  it("nets to zero when a job is reversed", () => {
    const s = summarizeLedger([
      { type: "earning", amount: 1400 },
      { type: "commission", amount: -350 },
      { type: "earning", amount: -1400 }, // reversal legs
      { type: "adjustment", amount: 350 },
    ]);
    expect(s.netEarnings).toBe(0);
    expect(s.commissionBalance).toBe(0);
    expect(s.commissionOwed).toBe(0);
  });
});
