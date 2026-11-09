import { describe, expect, it } from "vitest";
import {
  CAPTURE_MAX_EDGE,
  CAPTURE_QUALITY,
  cameraErrorMessage,
  captureFileName,
  fitWithin,
} from "./camera";

describe("fitWithin", () => {
  it("leaves a frame already inside the box alone", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("scales the longest side down to the limit, keeping the ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    // Portrait: height is the longest side.
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  // Upscaling a small frame makes a bigger, blurrier file and helps nobody.
  it("never scales up", () => {
    expect(fitWithin(320, 240, 1600)).toEqual({ width: 320, height: 240 });
  });

  // A very wide frame rounds its short side toward zero, and a canvas of
  // height 0 throws rather than producing a blank image.
  it("keeps at least one pixel on the short side", () => {
    const r = fitWithin(10000, 3, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it("returns an empty box for nonsense input instead of NaN", () => {
    expect(fitWithin(0, 100, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 100, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-5, 100, 1600)).toEqual({ width: 0, height: 0 });
  });

  it("caps a capture well under the 5MB bucket limit", () => {
    // 1600x1200 JPEG at q0.85 is a few hundred KB, an order of magnitude
    // below VERIFICATION_MAX_BYTES. This pins the intent, not the encoder.
    expect(CAPTURE_MAX_EDGE).toBeLessThanOrEqual(2000);
    expect(CAPTURE_QUALITY).toBeGreaterThan(0.7);
    expect(CAPTURE_QUALITY).toBeLessThan(1);
  });
});

describe("cameraErrorMessage", () => {
  // The denial case is the one people actually hit, and the copy has to say
  // why a gallery upload is not offered as a way round it.
  it("explains a denied permission without offering the gallery", () => {
    const m = cameraErrorMessage("NotAllowedError", "environment");
    expect(m).toContain("permission");
    expect(m.toLowerCase()).toContain("gallery");
  });

  it("tells a device with no camera to use a phone", () => {
    expect(cameraErrorMessage("NotFoundError", "user")).toContain("phone");
  });

  it("names the subject for a constraint failure", () => {
    expect(cameraErrorMessage("OverconstrainedError", "user")).toContain("selfie");
    expect(cameraErrorMessage("OverconstrainedError", "environment")).toContain("photo");
  });

  it("covers the busy-camera and insecure-origin cases", () => {
    expect(cameraErrorMessage("NotReadableError", "user")).toContain("another app");
    expect(cameraErrorMessage("SecurityError", "user")).toContain("https");
  });

  it("always returns a sentence, whatever the browser threw", () => {
    for (const name of [undefined, "", "SomethingNewError"]) {
      const m = cameraErrorMessage(name, "environment");
      expect(m.length).toBeGreaterThan(20);
    }
  });
});

describe("captureFileName", () => {
  // Cosmetic only — verificationPath() builds the storage key itself and
  // ignores this, which is what keeps a user-controlled name out of the key.
  it("names the capture after the document kind", () => {
    expect(captureFileName("cnic-front")).toBe("cnic-front.jpg");
    expect(captureFileName("selfie")).toBe("selfie.jpg");
  });
});
