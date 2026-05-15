import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { copyAttachment, detectFileType } from "@/tasks/attachmentService";

let vaultDir: string;

beforeEach(() => {
  vaultDir = mkdtempSync(join(tmpdir(), "slime-att-"));
});
afterEach(() => {
  rmSync(vaultDir, { recursive: true, force: true });
});

describe("attachmentService", () => {
  it("detects supported file types", () => {
    expect(detectFileType("photo.png")).toBe("image");
    expect(detectFileType("photo.jpg")).toBe("image");
    expect(detectFileType("photo.webp")).toBe("image");
    expect(detectFileType("file.pdf")).toBe("doc");
    expect(detectFileType("file.docx")).toBe("doc");
    expect(detectFileType("file.txt")).toBe("doc");
    expect(detectFileType("clip.mp4")).toBe("video");
    expect(detectFileType("clip.mov")).toBe("video");
  });

  it("copies file to vault _Assets/{type}/", () => {
    const srcFile = join(vaultDir, "source.png");
    writeFileSync(srcFile, "fake image data");

    const result = copyAttachment(srcFile, vaultDir);
    expect(result.fileType).toBe("image");
    expect(result.filePath).toMatch(/^_Assets\/image\//);
    expect(result.fileName).toBe("source.png");
    expect(existsSync(join(vaultDir, result.filePath))).toBe(true);
  });

  it("handles filename collision with timestamp suffix", () => {
    const srcFile = join(vaultDir, "dup.png");
    writeFileSync(srcFile, "data1");

    const r1 = copyAttachment(srcFile, vaultDir);
    writeFileSync(srcFile, "data2");
    const r2 = copyAttachment(srcFile, vaultDir);

    expect(r1.filePath).not.toBe(r2.filePath);
    expect(existsSync(join(vaultDir, r2.filePath))).toBe(true);
  });
});
