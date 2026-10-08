import { describe, expect, it } from "vitest";
import { detectImmersiveVrSupport, vrSessionError } from "@/lib/webxr";

describe("WebXR capability and error helpers", () => {
  it("reports unsupported when the browser has no WebXR API", async () => {
    await expect(detectImmersiveVrSupport(undefined)).resolves.toBe(false);
  });

  it("checks immersive VR support and treats probe failures as unsupported", async () => {
    await expect(detectImmersiveVrSupport({ isSessionSupported: async () => true })).resolves.toBe(true);
    await expect(detectImmersiveVrSupport({ isSessionSupported: async () => { throw new Error("probe failed"); } })).resolves.toBe(false);
  });

  it("explains permission denial and unexpected session failures", () => {
    expect(vrSessionError({ name: "NotAllowedError" })).toMatch(/permission/i);
    expect(vrSessionError(new Error("renderer failed"))).toMatch(/desktop mode/i);
  });
});
