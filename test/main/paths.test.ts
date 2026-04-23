import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/userData"),
    isPackaged: false,
    getAppPath: vi.fn(() => "/mock/app.asar"),
  },
}));

describe("paths", () => {
  beforeEach(() => {
    vi.resetModules();
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
        getPath: vi.fn(() => "/mock/userData"),
        isPackaged: true,
        getAppPath: vi.fn(() => "/mock/app.asar"),
      },
    }));
    vi.resetModules();
    const { paths } = await import("@/utils/paths");
    expect(paths.effectiveProjectRoot).toBe("/mock/userData/.slime/workspace/slime-src");
  });
});
