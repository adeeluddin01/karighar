import { describe, expect, it } from "vitest";
import { notifHref } from "./notifHref";

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

  it("returns null when there is no job to open", () => {
    expect(notifHref({ job_id: null }, "customer")).toBeNull();
    expect(notifHref({ job_id: null }, "provider")).toBeNull();
  });

  it("keeps the trailing slash before the query on every role", () => {
    for (const role of ["customer", "provider", "admin", "guest"] as const) {
      const href = notifHref(job, role);
      expect(href).not.toBeNull();
      expect(href!).toMatch(/\/(\?|$)/);
    }
  });
});
