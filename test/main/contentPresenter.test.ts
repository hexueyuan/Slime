import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: mockSendToRenderer },
}));

vi.mock("@/utils", () => ({
  logger: { debug: vi.fn(), info: vi.fn() },
  paths: { effectiveProjectRoot: "" },
}));

const { ContentPresenter } = await import("@/presenter/contentPresenter");
const { paths } = await import("@/utils");

const testRoot = join(tmpdir(), `slime-content-test-${Date.now()}`);

describe("ContentPresenter", () => {
  let cp: InstanceType<typeof ContentPresenter>;

  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    (paths as any).effectiveProjectRoot = testRoot;
    cp = new ContentPresenter();
    mockSendToRenderer.mockClear();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should set and get content", () => {
    const content = { type: "markdown" as const, content: "# Hello" };
    cp.setContent("s1", content);
    expect(cp.getContent("s1")).toEqual(content);
    expect(mockSendToRenderer).toHaveBeenCalledWith("content:updated", "s1", content);
  });

  it("should return null for unknown session", () => {
    expect(cp.getContent("unknown")).toBeNull();
  });

  it("should clear content", () => {
    cp.setContent("s1", { type: "markdown" as const, content: "hi" });
    cp.clearContent("s1");
    expect(cp.getContent("s1")).toBeNull();
    expect(mockSendToRenderer).toHaveBeenCalledWith("content:cleared", "s1");
  });

  it("should clear content for unknown session without error", () => {
    cp.clearContent("unknown");
    expect(mockSendToRenderer).toHaveBeenCalledWith("content:cleared", "unknown");
  });

  it("should open .md file as markdown content", async () => {
    writeFileSync(join(testRoot, "test.md"), "# Hello");
    await cp.openFile("s1", "test.md");
    const content = cp.getContent("s1");
    expect(content).not.toBeNull();
    expect(content!.type).toBe("markdown");
    expect((content as any).content).toBe("# Hello");
  });

  it("should open .html file as preview content", async () => {
    writeFileSync(join(testRoot, "test.html"), "<h1>Hello</h1>");
    await cp.openFile("s1", "test.html");
    const content = cp.getContent("s1");
    expect(content).not.toBeNull();
    expect(content!.type).toBe("preview");
    expect((content as any).html).toBe("<h1>Hello</h1>");
  });

  it("should open other text files as code-block markdown", async () => {
    writeFileSync(join(testRoot, "test.txt"), "plain text");
    await cp.openFile("s1", "test.txt");
    const content = cp.getContent("s1");
    expect(content).not.toBeNull();
    expect(content!.type).toBe("markdown");
    expect((content as any).content).toContain("```");
    expect((content as any).content).toContain("plain text");
  });

  it("should reject paths outside project root", async () => {
    await expect(cp.openFile("s1", "../../../etc/passwd")).rejects.toThrow("outside project root");
  });
});
