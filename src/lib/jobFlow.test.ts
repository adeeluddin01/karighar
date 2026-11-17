import { describe, it, expect } from "vitest";
import { canTransition, rebookHref } from "./jobFlow";

describe("job status state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("created", "assigned")).toBe(true);
    expect(canTransition("assigned", "en_route")).toBe(true);
    expect(canTransition("en_route", "arrived")).toBe(true);
    expect(canTransition("arrived", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("completed", "paid")).toBe(true);
    expect(canTransition("paid", "rated")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("created", "paid")).toBe(false);
    expect(canTransition("assigned", "completed")).toBe(false);
    expect(canTransition("rated", "paid")).toBe(false);
    expect(canTransition("in_progress", "paid")).toBe(false);
  });

  it("allows cancellation before completion but not after", () => {
    expect(canTransition("assigned", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(false);
  });
});

describe("rebookHref", () => {
  it("sends a fixed job back to its own service", () => {
    expect(rebookHref({ type: "fixed", service_id: "svc-7" })).toBe("/book/service/?id=svc-7");
  });

  it("sends a custom job to the quotes form, which is the only place it fits", () => {
    expect(rebookHref({ type: "custom", service_id: null })).toBe("/book/custom");
  });

  it("falls back to the catalogue for a fixed job with no service", () => {
    expect(rebookHref({ type: "fixed", service_id: null })).toBe("/book");
  });

  it("never carries a technician — the href is the service and nothing else", () => {
    const href = rebookHref({ type: "fixed", service_id: "svc-7" });
    expect(href).not.toContain("pro");
    expect(href).not.toContain("provider");
  });
});
