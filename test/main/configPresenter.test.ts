import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-config-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { configDir: testDir },
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

  it("should return null for unset keys", async () => {
    const presenter = new ConfigPresenter();
    const value = await presenter.get("nonexistent");
    expect(value).toBeNull();
  });

  it("should set and get a value", async () => {
    const presenter = new ConfigPresenter();
    const result = await presenter.set("theme", "dark");
    expect(result).toBe(true);
    const value = await presenter.get("theme");
    expect(value).toBe("dark");
  });

  it("should persist across instances", async () => {
    const p1 = new ConfigPresenter();
    await p1.set("lang", "zh");

    const p2 = new ConfigPresenter();
    const value = await p2.get("lang");
    expect(value).toBe("zh");
  });

  it("should emit event on set", async () => {
    const presenter = new ConfigPresenter();
    await presenter.set("key1", "val1");
    expect(mockSendToRenderer).toHaveBeenCalledWith("config:changed", "key1", "val1");
  });
});
