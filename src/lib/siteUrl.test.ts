import { afterEach, describe, expect, it } from "vitest";
import { authRedirect, safeNext, siteUrl, withSlash } from "./siteUrl";
import { BRAND } from "./config";

const ENV = "NEXT_PUBLIC_SITE_URL";

afterEach(() => {
  delete process.env[ENV];
});

describe("withSlash", () => {
  it("adds a trailing slash to a bare path", () => {
    expect(withSlash("/pro/onboarding")).toBe("/pro/onboarding/");
  });

  it("leaves an already-slashed path alone", () => {
    expect(withSlash("/pro/onboarding/")).toBe("/pro/onboarding/");
  });

  // The whole point: the slash has to land *before* the query string, or the
  // host's 301 can drop the params.
  it("puts the slash before a query string", () => {
    expect(withSlash("/bookings/view?id=1")).toBe("/bookings/view/?id=1");
    expect(withSlash("/bookings/view/?id=1")).toBe("/bookings/view/?id=1");
  });

  it("puts the slash before a hash", () => {
    expect(withSlash("/pro#rates")).toBe("/pro/#rates");
  });

  it("keeps root as root", () => {
    expect(withSlash("/")).toBe("/");
    expect(withSlash("")).toBe("/");
  });

  it("tolerates a missing leading slash", () => {
    expect(withSlash("pro/onboarding")).toBe("/pro/onboarding/");
  });
});

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    process.env[ENV] = "https://pinned.example";
    expect(siteUrl()).toBe("https://pinned.example");
  });

  it("strips a trailing slash from the env value", () => {
    process.env[ENV] = "https://pinned.example/";
    expect(siteUrl()).toBe("https://pinned.example");
  });

  it("ignores a blank env value", () => {
    process.env[ENV] = "   ";
    expect(siteUrl()).toBe(BRAND.siteUrl);
  });

  // No window in the node test env, so this is the prerender path.
  it("falls back to BRAND.siteUrl when there is no env and no window", () => {
    expect(siteUrl()).toBe(BRAND.siteUrl);
  });
});

describe("authRedirect", () => {
  it("always targets the slashed callback path", () => {
    process.env[ENV] = "https://pinned.example";
    expect(authRedirect("/")).toBe(
      "https://pinned.example/auth/callback/?next=%2F"
    );
  });

  it("slashes and encodes next", () => {
    process.env[ENV] = "https://pinned.example";
    expect(authRedirect("/pro/onboarding")).toBe(
      "https://pinned.example/auth/callback/?next=%2Fpro%2Fonboarding%2F"
    );
  });

  it("defaults next to root", () => {
    process.env[ENV] = "https://pinned.example";
    expect(authRedirect()).toBe("https://pinned.example/auth/callback/?next=%2F");
    expect(authRedirect("")).toBe("https://pinned.example/auth/callback/?next=%2F");
  });
});

describe("safeNext", () => {
  it("keeps an ordinary in-app destination", () => {
    expect(safeNext("/jobs")).toBe("/jobs");
    expect(safeNext("/bookings/view/?id=1")).toBe("/bookings/view/?id=1");
    expect(safeNext("/pro/dashboard/")).toBe("/pro/dashboard/");
  });

  // The open redirect this exists to close. "//evil.com" is a
  // protocol-relative URL: withSlash() passes it through untouched and the
  // browser then navigates off-site.
  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/path?a=1")).toBe("/");
  });

  // Browsers normalize a backslash to a slash in the authority position, so
  // "/\evil.com" is the same attack spelled differently.
  it("rejects a backslash authority", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
  });

  it("rejects anything with a scheme or no root", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext("evil.com")).toBe("/");
  });

  it("falls back to / for absent or blank input", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("   ")).toBe("/");
  });

  it("is applied by authRedirect, so an off-site next cannot be emailed", () => {
    process.env[ENV] = "https://thekarighar.com";
    expect(authRedirect("//evil.com")).toBe(
      "https://thekarighar.com/auth/callback/?next=%2F"
    );
  });
});
