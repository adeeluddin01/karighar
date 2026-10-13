import { describe, expect, it } from "vitest";
import { CONFIRM_EMAIL_NOTICE, authErrorMessage } from "./authActions";

describe("authErrorMessage", () => {
  it("explains a cancelled consent screen", () => {
    expect(authErrorMessage("oauth_denied")).toMatch(/cancelled/i);
    expect(authErrorMessage("access_denied")).toMatch(/cancelled/i);
  });

  it("explains an expired link", () => {
    expect(authErrorMessage("link_expired")).toMatch(/expired/i);
  });

  // The PKCE-code-opened-elsewhere case, which otherwise looks like a hard
  // failure even though the password route still works.
  it("tells the user which browser to use", () => {
    expect(authErrorMessage("wrong_browser")).toMatch(/browser/i);
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(authErrorMessage("something-new")).toMatch(/couldn't finish/i);
    expect(authErrorMessage("")).toMatch(/couldn't finish/i);
  });

  it("never returns an empty string", () => {
    for (const code of ["oauth", "oauth_denied", "link_expired", "wrong_browser", "no_credentials", "zzz"]) {
      expect(authErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe("CONFIRM_EMAIL_NOTICE", () => {
  // Supabase hands back a decoy user for an already-registered address, so
  // the copy must not confirm that an account was created.
  it("does not leak whether the address already had an account", () => {
    expect(CONFIRM_EMAIL_NOTICE.toLowerCase()).not.toContain("account created");
    expect(CONFIRM_EMAIL_NOTICE).toMatch(/if that address is new/i);
  });

  it("does not leak the developer workaround", () => {
    expect(CONFIRM_EMAIL_NOTICE.toLowerCase()).not.toContain("supabase");
  });
});
