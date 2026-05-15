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

  it("workspaceDir points to userData/.slime/workspace", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.workspaceDir).toBe("/mock/userData/.slime/workspace");
  });

  it("sourceDir points to workspace/slime-src", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.sourceDir).toBe("/mock/userData/.slime/workspace/slime-src");
  });

  it("workspaceReadyFile points to workspace/.ready", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.workspaceReadyFile).toBe("/mock/userData/.slime/workspace/.ready");
  });

  it("effectiveProjectRoot returns cwd when not packaged", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.effectiveProjectRoot).toBe(process.cwd());
  });

  it("effectiveProjectRoot returns sourceDir when packaged", async () => {
    vi.doMock("electron", () => ({
      app: {
        getPath: vi.fn((name: string) => (name === "home" ? "/mock/home" : "/mock/userData")),
        isPackaged: true,
        getAppPath: vi.fn(() => "/mock/app.asar"),
      },
    }));
    vi.resetModules();
    const { paths } = await import("@/utils/paths");
    expect(paths.effectiveProjectRoot).toBe("/mock/userData/.slime/workspace/slime-src");
  });

  it("slimeHomeDir defaults to ~/.slime for development", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.slimeHomeDir).toBe("/mock/home/.slime");
  });

  it("slimeHomeDir follows SLIME_HOME_DIR when explicitly set", async () => {
    process.env.SLIME_HOME_DIR = "/tmp/slime-home";
    const { paths } = await import("@/utils/paths");
    expect(paths.slimeHomeDir).toBe("/tmp/slime-home");
  });

  it("slimeHomeDir derives from custom userData profiles", async () => {
    process.env.SLIME_USER_DATA_DIR = "/tmp/slime-staging";
    const { paths } = await import("@/utils/paths");
    expect(paths.slimeHomeDir).toBe("/mock/userData/.slime-home");
  });

  it("slimeHomeDir derives from e2e userData profiles", async () => {
    process.env.SLIME_E2E_USER_DATA = "/tmp/slime-e2e";
    const { paths } = await import("@/utils/paths");
    expect(paths.slimeHomeDir).toBe("/mock/userData/.slime-home");
  });
});
