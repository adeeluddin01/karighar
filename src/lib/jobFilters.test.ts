import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  isDefaultFilters,
  serviceOptions,
  statusOptions,
  type JobFilters,
} from "@/lib/jobFilters";
import type { Job } from "@/lib/types";

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    customer_id: "cust-1",
    type: "fixed",
    service_id: null,
    title: "Test job",
    description: null,
    photos: [],
    status: "created",
    address: "DHA, Karachi",
    lat: null,
    lng: null,
    scheduled_at: null,
    price: null,
    provider_id: null,
    commission_rate: 0.2,
    created_at: "2026-11-03T08:00:00.000Z",
    updated_at: "2026-11-03T08:00:00.000Z",
    ...partial,
  } as Job;
}

const SERVICES = [
  { id: "svc-ac", name: "AC General Service" },
  { id: "svc-plumb", name: "Leak Fix" },
  { id: "svc-unused", name: "No Jobs Here" },
];

const JOBS = [
  job({ id: "a", type: "fixed", service_id: "svc-ac", price: 1750, status: "created" }),
  job({ id: "b", type: "fixed", service_id: "svc-plumb", price: 800, status: "created" }),
  job({
    id: "c",
    type: "custom",
    service_id: null,
    price: null,
    status: "bidding",
    scheduled_at: "2026-11-04T10:00:00.000Z",
  }),
  job({
    id: "d",
    type: "fixed",
    service_id: "svc-ac",
    price: 2800,
    status: "assigned",
    scheduled_at: "2026-11-03T12:00:00.000Z",
    created_at: "2026-11-03T09:00:00.000Z",
  }),
];

function withFilters(partial: Partial<JobFilters>): JobFilters {
  return { ...DEFAULT_JOB_FILTERS, ...partial };
}

describe("filterJobs", () => {
  it("defaults to newest first and passes everything through", () => {
    expect(filterJobs(JOBS, DEFAULT_JOB_FILTERS).map((j) => j.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("filters by job type, multi-select", () => {
    expect(filterJobs(JOBS, withFilters({ types: ["custom"] })).map((j) => j.id)).toEqual(["c"]);
    expect(filterJobs(JOBS, withFilters({ types: ["fixed"] })).map((j) => j.id)).toEqual([
      "d",
      "a",
      "b",
    ]);
  });

  it("selecting every type, or none, passes everything through", () => {
    const all = ["d", "a", "b", "c"];
    expect(filterJobs(JOBS, withFilters({ types: ["fixed", "custom"] })).map((j) => j.id)).toEqual(all);
    expect(filterJobs(JOBS, withFilters({ types: [] })).map((j) => j.id)).toEqual(all);
  });

  it("filters by a specific service", () => {
    expect(filterJobs(JOBS, withFilters({ serviceId: "svc-ac" })).map((j) => j.id)).toEqual([
      "d",
      "a",
    ]);
  });

  it("offers a custom-request bucket for jobs with no service", () => {
    expect(filterJobs(JOBS, withFilters({ serviceId: "custom" })).map((j) => j.id)).toEqual([
      "c",
    ]);
  });

  it("filters by status", () => {
    expect(filterJobs(JOBS, withFilters({ status: "assigned" })).map((j) => j.id)).toEqual([
      "d",
    ]);
  });

  it("sorts price low to high with on-quote jobs last", () => {
    expect(filterJobs(JOBS, withFilters({ sort: "priceAsc" })).map((j) => j.id)).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
  });

  it("sorts price high to low with on-quote jobs last", () => {
    expect(filterJobs(JOBS, withFilters({ sort: "priceDesc" })).map((j) => j.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("sorts soonest first with unscheduled jobs last", () => {
    expect(filterJobs(JOBS, withFilters({ sort: "soonest" })).map((j) => j.id)).toEqual([
      "d",
      "c",
      "a",
      "b",
    ]);
  });

  it("does not mutate the input array", () => {
    const before = [...JOBS];
    filterJobs(JOBS, withFilters({ sort: "priceAsc" }));
    expect(JOBS).toEqual(before);
  });
});

describe("serviceOptions", () => {
  it("offers only services present in the jobs, plus the custom bucket", () => {
    const { options, hasCustom } = serviceOptions(JOBS, SERVICES);
    expect(options.map((o) => o.id)).toEqual(["svc-ac", "svc-plumb"]);
    expect(hasCustom).toBe(true);
  });

  it("has no custom bucket when every job has a service", () => {
    expect(serviceOptions(JOBS.slice(0, 2), SERVICES).hasCustom).toBe(false);
  });
});

describe("statusOptions", () => {
  it("lists present statuses in canonical order", () => {
    expect(statusOptions(JOBS)).toEqual(["created", "bidding", "assigned"]);
  });
});

describe("isDefaultFilters", () => {
  it("recognises the default and a changed set", () => {
    expect(isDefaultFilters(DEFAULT_JOB_FILTERS)).toBe(true);
    expect(isDefaultFilters(withFilters({ sort: "priceAsc" }))).toBe(false);
    expect(isDefaultFilters(withFilters({ types: ["fixed"] }))).toBe(false);
  });
});
