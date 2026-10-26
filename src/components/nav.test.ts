import { describe, expect, it } from "vitest";
import { PHONE_NAV, NAV, ROLE_HOME, ROLE_MAP, isActive, roleOf, samePath, type Role } from "./nav";

// Derived from the table itself rather than written out, so a role added to
// `Role` is covered by every loop below without anyone remembering to.
const ROLES = Object.keys(PHONE_NAV) as Role[];

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

describe("samePath", () => {
  // The tab bars in AdminShell/BusinessShell nest, so they need exact
  // matching where the sidebar wants section highlighting.
  it("does not light up the parent on a child page", () => {
    expect(samePath("/business/team", "/business")).toBe(false);
    expect(samePath("/admin/businesses", "/admin")).toBe(false);
  });

  it("still matches through a trailing slash, which the export adds", () => {
    expect(samePath("/business/", "/business")).toBe(true);
    expect(samePath("/admin/jobs/", "/admin/jobs")).toBe(true);
  });
});

describe("roleOf", () => {
  it("needs the businesses row, not just the role column, to open the board", () => {
    expect(roleOf(true, "business", null, "active")).toBe("business");
    // profiles.role is self-writable under profiles_upd; the row is not.
    expect(roleOf(true, "business", null, null)).toBe("customer");
    expect(roleOf(true, "business", null, "suspended")).toBe("customer");
  });

  it("leaves the three existing roles exactly as they were", () => {
    expect(roleOf(false, "provider", "approved", null)).toBe("guest");
    expect(roleOf(true, "admin", null, null)).toBe("admin");
    expect(roleOf(true, "provider", "approved", null)).toBe("provider");
    expect(roleOf(true, "provider", "pending", null)).toBe("customer");
    expect(roleOf(true, "customer", null, null)).toBe("customer");
  });

  it("resolves a hand-edited account that is somehow both", () => {
    expect(roleOf(true, "business", "approved", "active")).toBe("business");
    expect(roleOf(true, "admin", "approved", "active")).toBe("admin");
  });
});

describe("role landing pages", () => {
  it("gives every role a home and a map destination", () => {
    for (const role of ROLES) {
      expect(ROLE_HOME[role]).toBeTruthy();
      expect(ROLE_MAP[role]).toBeTruthy();
    }
  });

  it("sends a business to its own board, never the customer home", () => {
    expect(ROLE_HOME.business).toBe("/business");
    expect(ROLE_MAP.business).toBe("/business");
  });
});

describe("phone tab bar", () => {
  // The pill bar fits four; a fifth does not at 360px.
  it("gives every role exactly four tabs", () => {
    for (const role of ROLES) {
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
      for (const role of ROLES) {
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
