import { describe, expect, it } from "vitest";
import { PHONE_NAV, NAV, isActive } from "./nav";

describe("isActive", () => {
  it("matches a page and its children", () => {
    expect(isActive("/book", "/book")).toBe(true);
    expect(isActive("/book/service", "/book")).toBe(true);
    expect(isActive("/pro/jobs/view", "/pro")).toBe(true);
  });

  // The bug: "/bookings" starts with "/book", so a prefix test lit up both.
  it("does not treat a prefix as a match across a segment boundary", () => {
    expect(isActive("/bookings", "/book")).toBe(false);
    expect(isActive("/bookings/view", "/book")).toBe(false);
    expect(isActive("/book", "/bookings")).toBe(false);
  });

  it("tolerates trailing slashes on either side", () => {
    for (const [path, href] of [
      ["/book/", "/book"],
      ["/book", "/book/"],
      ["/book/", "/book/"],
      ["/book/service/", "/book"],
    ] as const) {
      expect(isActive(path, href)).toBe(true);
    }
    expect(isActive("/bookings/", "/book/")).toBe(false);
  });

  it("keeps Home exact, so it isn't active everywhere", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/book", "/")).toBe(false);
    expect(isActive("/bookings", "/")).toBe(false);
  });

  it("separates the two map routes", () => {
    expect(isActive("/pro/map", "/pro/map")).toBe(true);
    expect(isActive("/map", "/pro/map")).toBe(false);
  });
});

describe("phone tab bar", () => {
  // The pill bar fits four; a fifth does not at 360px.
  it("gives every role exactly four tabs", () => {
    for (const role of ["guest", "customer", "provider", "admin"] as const) {
      expect(PHONE_NAV[role]).toHaveLength(4);
    }
  });

  it("offers customers Services rather than the map", () => {
    for (const role of ["guest", "customer"] as const) {
      const hrefs = PHONE_NAV[role].map((t) => t.href);
      expect(hrefs).toContain("/book");
      expect(hrefs).not.toContain("/map");
    }
  });

  it("leaves the provider's own map tab alone", () => {
    expect(PHONE_NAV.provider.map((t) => t.href)).toContain("/pro/map");
  });

  // Guards the prefix bug at the data level. An entry may also light up for
  // a genuine ANCESTOR of the current page (/admin stays lit on
  // /admin/providers) — that is deliberate section highlighting, and quite
  // different from "/book" lighting up on "/bookings", where neither path
  // contains the other. Only the latter is a bug.
  const isAncestor = (maybeParent: string, page: string) =>
    maybeParent !== page && page.startsWith(maybeParent.replace(/\/$/, "") + "/");

  for (const [name, table] of [
    ["phone tab bar", PHONE_NAV],
    ["sidebar", NAV],
  ] as const) {
    it(`never lights up an unrelated ${name} entry`, () => {
      for (const role of ["guest", "customer", "provider", "admin"] as const) {
        for (const page of table[role]) {
          const active = table[role].filter((l) => isActive(page.href, l.href));
          for (const l of active) {
            const related = l.href === page.href || isAncestor(l.href, page.href);
            expect(
              related,
              `on ${page.href} (${role}/${name}) the entry ${l.href} should not be active`
            ).toBe(true);
          }
          expect(active.map((l) => l.href)).toContain(page.href);
        }
      }
    });
  }
});
