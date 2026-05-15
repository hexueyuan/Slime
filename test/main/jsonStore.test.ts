import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

const { JsonStore } = await import("@/utils/jsonStore");

describe("JsonStore", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("reads default values for missing or corrupt files", async () => {
    const store = new JsonStore<string[]>("test-missing.json", []);
    expect(await store.read()).toEqual([]);

    const filePath = join(testDir, "corrupt.json");
    writeFileSync(filePath, "{{{invalid");
    const corruptStore = new JsonStore<string[]>("corrupt.json", ["fallback"]);
    expect(await corruptStore.read()).toEqual(["fallback"]);
  });

  it("writes, reads, and creates nested directories", async () => {
    const store = new JsonStore<{ name: string }>("test-rw.json", { name: "" });
    await store.write({ name: "slime" });
    expect(await store.read()).toEqual({ name: "slime" });

    const nestedStore = new JsonStore<number[]>("sub/nested.json", []);
    await nestedStore.write([1, 2, 3]);
    expect(await nestedStore.read()).toEqual([1, 2, 3]);
  });

  it("should use custom baseDir when provided", async () => {
    const customDir = join(tmpdir(), `slime-test-custom-${Date.now()}`);
    mkdirSync(customDir, { recursive: true });
    try {
      const store = new JsonStore<{ key: string }>("custom.json", { key: "" }, customDir);
      await store.write({ key: "custom" });
      const data = await store.read();
      expect(data).toEqual({ key: "custom" });
    } finally {
      rmSync(customDir, { recursive: true, force: true });
    }
  });
});
