import { describe, it, expect } from "vitest";
import {
  CATALOG_IMAGE_ACCEPT,
  CATALOG_IMAGE_MAX_BYTES,
  serviceImageExt,
  serviceImagePath,
  validateServiceImage,
} from "./serviceImage";

describe("validateServiceImage", () => {
  // The file input's `accept` and the check that enforces it are two
  // separate lists; this is what keeps them from drifting apart.
  it("accepts the three formats the input offers", () => {
    for (const type of CATALOG_IMAGE_ACCEPT.split(",")) {
      expect(validateServiceImage({ type, size: 1000 }), type).toBeNull();
    }
  });

  it("rejects a non-image, and says what to pick instead", () => {
    const msg = validateServiceImage({ type: "application/pdf", size: 1000 });
    expect(msg).toMatch(/JPG, PNG or WebP/);
  });

  // HEIC is what an iPhone produces by default and no browser can decode it,
  // so a silently-accepted upload would store a photo that renders as
  // nothing — and the card would fall back to the icon with no clue why.
  it("rejects HEIC rather than storing something no browser can show", () => {
    expect(validateServiceImage({ type: "image/heic", size: 1000 })).toBeTruthy();
  });

  it("rejects an oversized photo and names the actual size", () => {
    const msg = validateServiceImage({ type: "image/jpeg", size: 5 * 1024 * 1024 });
    expect(msg).toContain("5.0MB");
    expect(msg).toContain("under 3MB");
  });

  it("allows a file exactly on the limit", () => {
    expect(validateServiceImage({ type: "image/jpeg", size: CATALOG_IMAGE_MAX_BYTES })).toBeNull();
    expect(
      validateServiceImage({ type: "image/jpeg", size: CATALOG_IMAGE_MAX_BYTES + 1 })
    ).toBeTruthy();
  });
});

describe("serviceImageExt", () => {
  it("maps each accepted type to its extension", () => {
    expect(serviceImageExt("image/png")).toBe("png");
    expect(serviceImageExt("image/webp")).toBe("webp");
    expect(serviceImageExt("image/jpeg")).toBe("jpg");
  });

  it("falls back to jpg for anything else", () => {
    expect(serviceImageExt("application/octet-stream")).toBe("jpg");
  });
});

describe("serviceImagePath", () => {
  const id = "3f1b0c9e-0000-4000-8000-000000000001";

  it("puts each kind in its own folder, keyed on the row id", () => {
    expect(serviceImagePath("service", id, "image/png")).toBe(`services/${id}.png`);
    expect(serviceImagePath("category", id, "image/jpeg")).toBe(`categories/${id}.jpg`);
  });

  // Deterministic, so a re-upload REPLACES the photo. There is no cleanup
  // job in this project, so a fresh key per upload would leave every
  // superseded photo in the bucket forever.
  it("is stable for the same row and type", () => {
    expect(serviceImagePath("service", id, "image/webp")).toBe(
      serviceImagePath("service", id, "image/webp")
    );
  });

  // The admin's own filename must never travel into the key — the mistake
  // verificationDoc.ts was written to avoid.
  it("never carries a user-supplied filename", () => {
    for (const kind of ["service", "category"] as const) {
      for (const type of CATALOG_IMAGE_ACCEPT.split(",")) {
        expect(serviceImagePath(kind, id, type)).toMatch(
          /^(services|categories)\/[^/]+\.(jpg|png|webp)$/
        );
      }
    }
  });
});
