import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/userData"),
    isPackaged: true,
    getAppPath: vi.fn(() => "/mock/app.asar"),
  },
}));

vi.mock("@/utils", () => ({
  paths: {
    workspaceDir: "/mock/workspace",
    sourceDir: "/mock/workspace/slime-src",
    workspaceReadyFile: "/mock/workspace/.ready",
    effectiveProjectRoot: "/mock/workspace/slime-src",
  },
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

describe("WorkspacePresenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("isReady", () => {
    it("returns true when .ready file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.isReady()).toBe(true);
    });

    it("returns false when .ready file missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.isReady()).toBe(false);
    });
  });

  describe("needsInit", () => {
    it("returns true when packaged and not ready", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.needsInit()).toBe(true);
    });
  });

  describe("getProjectRoot", () => {
    it("returns effectiveProjectRoot from paths", async () => {
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(wp.getProjectRoot()).toBe("/mock/workspace/slime-src");
    });
  });
});
