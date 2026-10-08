export type WebXRSystem = {
  isSessionSupported: (mode: "immersive-vr") => Promise<boolean>;
};

export async function detectImmersiveVrSupport(xr: WebXRSystem | undefined): Promise<boolean> {
  if (!xr) return false;
  try {
    return await xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}

export function vrSessionError(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && error.name === "NotAllowedError") {
    return "The browser or headset denied the VR session. Check its permissions, or continue in desktop mode.";
  }
  return "VR could not start on this device. You can continue in desktop mode.";
}
