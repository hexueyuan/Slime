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

  it("should return default value when file does not exist", async () => {
    const store = new JsonStore<string[]>("test-missing.json", []);
    const data = await store.read();
    expect(data).toEqual([]);
  });

  it("should write and read data", async () => {
    const store = new JsonStore<{ name: string }>("test-rw.json", { name: "" });
    await store.write({ name: "slime" });
    const data = await store.read();
    expect(data).toEqual({ name: "slime" });
  });

  it("should create directories if missing", async () => {
    const store = new JsonStore<number[]>("sub/nested.json", []);
    await store.write([1, 2, 3]);
    const data = await store.read();
    expect(data).toEqual([1, 2, 3]);
  });

  it("should return default on corrupt JSON", async () => {
    const filePath = join(testDir, "corrupt.json");
    writeFileSync(filePath, "{{{invalid");
    const store = new JsonStore<string[]>("corrupt.json", ["fallback"]);
    const data = await store.read();
    expect(data).toEqual(["fallback"]);
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
