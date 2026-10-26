import { describe, expect, it } from "vitest";
import { notifHref, notifFallbackHref } from "./notifHref";

const job = { job_id: "job-1" };

describe("notifHref", () => {
  it("sends a provider to their own job page", () => {
    expect(notifHref(job, "provider")).toBe("/pro/jobs/view/?id=job-1");
  });

  it("sends a customer to the booking page", () => {
    expect(notifHref(job, "customer")).toBe("/bookings/view/?id=job-1");
  });

  it("treats a guest like a customer", () => {
    expect(notifHref(job, "guest")).toBe("/bookings/view/?id=job-1");
  });

  it("sends an admin to the jobs list, which is all they have", () => {
    expect(notifHref(job, "admin")).toBe("/admin/jobs/");
  });

  // The regression this file exists to prevent: the old switch had a
  // `default:` and would have sent a dispatcher to the CUSTOMER booking page,
  // which jobs_select will not show them.
  it("sends a business to its dispatch board, not the customer booking page", () => {
    expect(notifHref(job, "business")).toBe("/business/");
  });

  it("returns null when there is no job to open", () => {
    expect(notifHref({ job_id: null }, "customer")).toBeNull();
    expect(notifHref({ job_id: null }, "provider")).toBeNull();
    expect(notifHref({ job_id: null }, "business")).toBeNull();
  });

  it("keeps the trailing slash before the query on every role", () => {
    for (const role of ["customer", "provider", "admin", "guest", "business"] as const) {
      const href = notifHref(job, role);
      expect(href).not.toBeNull();
      expect(href!).toMatch(/\/(\?|$)/);
    }
  });
});

describe("notifFallbackHref", () => {
  const invite = { job_id: null, type: "business_invite" };

  it("sends a technician to their dashboard, where the invite banner lives", () => {
    expect(notifFallbackHref(invite, "provider")).toBe("/pro/dashboard/");
    // Only an approved technician can be invited, so this should not come up
    // — but falling back to the same place is the safe answer if it does.
    expect(notifFallbackHref(invite, "customer")).toBe("/pro/dashboard/");
  });

  it("sends the business to its team screen", () => {
    expect(notifFallbackHref(invite, "business")).toBe("/business/team/");
  });

  it("stays out of the way when the notification already has a job", () => {
    expect(notifFallbackHref({ job_id: "job-1", type: "business_invite" }, "provider")).toBeNull();
  });

  it("has nothing to offer for other job-less types", () => {
    expect(notifFallbackHref({ job_id: null, type: "status" }, "customer")).toBeNull();
  });
});
