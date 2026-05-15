import { app } from "electron";

export type RuntimeProfileName = "production" | "development" | "staging" | "e2e";

export interface RuntimeProfile {
  name: RuntimeProfileName;
  userData: string;
  isPackaged: boolean;
  isE2E: boolean;
  isCustomDataDir: boolean;
}

export function resolveRuntimeProfile(): RuntimeProfile {
  const e2eUserData = process.env.SLIME_E2E_USER_DATA;
  if (e2eUserData) {
    app.setPath("userData", e2eUserData);
    return {
      name: "e2e",
      userData: app.getPath("userData"),
      isPackaged: app.isPackaged,
      isE2E: true,
      isCustomDataDir: true,
    };
  }

  const customUserData = process.env.SLIME_USER_DATA_DIR;
  if (customUserData) {
    app.setPath("userData", customUserData);
    return {
      name: "staging",
      userData: app.getPath("userData"),
      isPackaged: app.isPackaged,
      isE2E: false,
      isCustomDataDir: true,
    };
  }

  return {
    name: app.isPackaged ? "production" : "development",
    userData: app.getPath("userData"),
    isPackaged: app.isPackaged,
    isE2E: false,
    isCustomDataDir: false,
  };
}
