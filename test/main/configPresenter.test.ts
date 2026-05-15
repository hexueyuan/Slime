import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-config-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { configDir: testDir, slimeHomeDir: testDir },
}));

const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: mockSendToRenderer },
}));

const { ConfigPresenter } = await import("@/presenter/configPresenter");

describe("ConfigPresenter", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    mockSendToRenderer.mockClear();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("reads missing keys, persists values, and emits changes", async () => {
    const presenter = new ConfigPresenter();

    expect(await presenter.get("nonexistent")).toBeNull();
    expect(await presenter.set("theme", "dark")).toBe(true);
    expect(await presenter.get("theme")).toBe("dark");
    await expect(new ConfigPresenter().get("theme")).resolves.toBe("dark");
    expect(mockSendToRenderer).toHaveBeenCalledWith("config:changed", "theme", "dark");
  });
});
