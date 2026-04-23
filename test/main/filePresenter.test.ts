import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { FilePresenter } from "@/presenter/filePresenter";

describe("FilePresenter", () => {
  const testRoot = join(tmpdir(), `slime-file-test-${Date.now()}`);
  let fp: FilePresenter;

  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    fp = new FilePresenter(testRoot);
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  describe("read", () => {
    it("should read file content", async () => {
      writeFileSync(join(testRoot, "hello.txt"), "line1\nline2\nline3");
      const result = await fp.read("hello.txt");
      expect(result).toBe("line1\nline2\nline3");
    });

    it("should read with offset and limit", async () => {
      writeFileSync(join(testRoot, "lines.txt"), "a\nb\nc\nd\ne");
      const result = await fp.read("lines.txt", 1, 2);
      expect(result).toBe("b\nc");
    });

    it("should reject path traversal", async () => {
      await expect(fp.read("../etc/passwd")).rejects.toThrow("outside project");
    });

    it("should return error for non-existent file", async () => {
      await expect(fp.read("no-such-file.txt")).rejects.toThrow();
    });
  });

  describe("write", () => {
    it("should write file", async () => {
      const ok = await fp.write("out.txt", "hello");
      expect(ok).toBe(true);
      expect(readFileSync(join(testRoot, "out.txt"), "utf-8")).toBe("hello");
    });

    it("should create intermediate directories", async () => {
      const ok = await fp.write("sub/dir/file.txt", "deep");
      expect(ok).toBe(true);
      expect(readFileSync(join(testRoot, "sub/dir/file.txt"), "utf-8")).toBe("deep");
    });

    it("should reject path traversal", async () => {
      await expect(fp.write("../evil.txt", "bad")).rejects.toThrow("outside project");
    });
  });

  describe("edit", () => {
    it("should replace text", async () => {
      writeFileSync(join(testRoot, "code.ts"), "const x = 1;\nconst y = 2;");
      const ok = await fp.edit("code.ts", "const x = 1;", "const x = 42;");
      expect(ok).toBe(true);
      expect(readFileSync(join(testRoot, "code.ts"), "utf-8")).toBe("const x = 42;\nconst y = 2;");
    });

    it("should fail if old_text not found", async () => {
      writeFileSync(join(testRoot, "code.ts"), "hello");
      await expect(fp.edit("code.ts", "notfound", "new")).rejects.toThrow("not found");
    });

    it("should fail if old_text matches multiple times", async () => {
      writeFileSync(join(testRoot, "dup.ts"), "aaa\naaa");
      await expect(fp.edit("dup.ts", "aaa", "bbb")).rejects.toThrow("multiple");
    });
  });
});
