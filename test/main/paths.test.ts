import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => (name === "home" ? "/mock/home" : "/mock/userData")),
    isPackaged: false,
    getAppPath: vi.fn(() => "/mock/app.asar"),
  },
}));

describe("paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("derives workspace paths from userData", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.workspaceDir).toBe("/mock/userData/.slime/workspace");
    expect(paths.sourceDir).toBe("/mock/userData/.slime/workspace/slime-src");
    expect(paths.workspaceReadyFile).toBe("/mock/userData/.slime/workspace/.ready");
  });

  it("uses cwd in development and sourceDir when packaged", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.effectiveProjectRoot).toBe(process.cwd());

    vi.doMock("electron", () => ({
      app: {
        getPath: vi.fn((name: string) => (name === "home" ? "/mock/home" : "/mock/userData")),
        isPackaged: true,
        getAppPath: vi.fn(() => "/mock/app.asar"),
      },
    }));
    vi.resetModules();
    const packaged = await import("@/utils/paths");
    expect(packaged.paths.effectiveProjectRoot).toBe("/mock/userData/.slime/workspace/slime-src");
  });

  it("resolves slimeHomeDir from development default, explicit override, and isolated profiles", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.slimeHomeDir).toBe("/mock/home/.slime");

    process.env.SLIME_HOME_DIR = "/tmp/slime-home";
    vi.resetModules();
    const explicit = await import("@/utils/paths");
    expect(explicit.paths.slimeHomeDir).toBe("/tmp/slime-home");

    delete process.env.SLIME_HOME_DIR;
    process.env.SLIME_USER_DATA_DIR = "/tmp/slime-staging";
    vi.resetModules();
    const custom = await import("@/utils/paths");
    expect(custom.paths.slimeHomeDir).toBe("/mock/userData/.slime-home");

    delete process.env.SLIME_USER_DATA_DIR;
    process.env.SLIME_E2E_USER_DATA = "/tmp/slime-e2e";
    vi.resetModules();
    const e2e = await import("@/utils/paths");
    expect(e2e.paths.slimeHomeDir).toBe("/mock/userData/.slime-home");
  });
});
