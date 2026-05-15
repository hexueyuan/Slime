import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockApp = {
  isPackaged: false,
  getPath: vi.fn((name: string) =>
    name === "userData" ? "/default/userData" : "/default/appData",
  ),
  setPath: vi.fn(),
};

vi.mock("electron", () => ({
  app: mockApp,
}));

describe("resolveRuntimeProfile", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
    mockApp.isPackaged = false;
    mockApp.getPath.mockImplementation((name: string) =>
      name === "userData" ? "/default/userData" : "/default/appData",
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses SLIME_E2E_USER_DATA before other profile overrides", async () => {
    process.env.SLIME_E2E_USER_DATA = "/tmp/slime-e2e";
    process.env.SLIME_USER_DATA_DIR = "/tmp/slime-staging";
    mockApp.getPath.mockImplementation((name: string) =>
      name === "userData" ? "/tmp/slime-e2e" : "/default/appData",
    );

    const { resolveRuntimeProfile } = await import("@/utils/runtimeProfile");
    const profile = resolveRuntimeProfile();

    expect(mockApp.setPath).toHaveBeenCalledWith("userData", "/tmp/slime-e2e");
    expect(profile).toMatchObject({
      name: "e2e",
      userData: "/tmp/slime-e2e",
      isPackaged: false,
      isE2E: true,
      isCustomDataDir: true,
    });
  });

  it("uses SLIME_USER_DATA_DIR for staging profiles", async () => {
    process.env.SLIME_USER_DATA_DIR = "/tmp/slime-staging";
    mockApp.getPath.mockImplementation((name: string) =>
      name === "userData" ? "/tmp/slime-staging" : "/default/appData",
    );

    const { resolveRuntimeProfile } = await import("@/utils/runtimeProfile");
    const profile = resolveRuntimeProfile();

    expect(mockApp.setPath).toHaveBeenCalledWith("userData", "/tmp/slime-staging");
    expect(profile).toMatchObject({
      name: "staging",
      userData: "/tmp/slime-staging",
      isE2E: false,
      isCustomDataDir: true,
    });
  });

  it("marks packaged default as production without rewriting userData", async () => {
    mockApp.isPackaged = true;

    const { resolveRuntimeProfile } = await import("@/utils/runtimeProfile");
    const profile = resolveRuntimeProfile();

    expect(mockApp.setPath).not.toHaveBeenCalled();
    expect(profile).toMatchObject({
      name: "production",
      userData: "/default/userData",
      isPackaged: true,
      isE2E: false,
      isCustomDataDir: false,
    });
  });

  it("marks non-packaged default as development without slime-dev userData", async () => {
    const { resolveRuntimeProfile } = await import("@/utils/runtimeProfile");
    const profile = resolveRuntimeProfile();

    expect(mockApp.setPath).not.toHaveBeenCalled();
    expect(profile).toMatchObject({
      name: "development",
      userData: "/default/userData",
      isPackaged: false,
      isE2E: false,
      isCustomDataDir: false,
    });
  });
});
