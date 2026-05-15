import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("@/eventbus", () => ({ eventBus: { sendToRenderer: vi.fn() } }));

const mockPaths = { projectRoot: process.cwd(), effectiveProjectRoot: process.cwd() };
vi.mock("@/utils/paths", () => ({ paths: mockPaths }));

vi.mock("electron", () => ({ app: { getPath: vi.fn().mockReturnValue("/tmp/slime-userdata") } }));

const { ToolPresenter } = await import("@/presenter/toolPresenter");
const { FilePresenter } = await import("@/presenter/filePresenter");
const { ContentPresenter } = await import("@/presenter/contentPresenter");

describe("ToolPresenter exec env injection", () => {
  const testRoot = join(tmpdir(), `slime-exec-env-test-${Date.now()}`);
  let tp: InstanceType<typeof ToolPresenter>;

  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    mockPaths.effectiveProjectRoot = testRoot;
    const fp = new FilePresenter(testRoot);
    const cp = new ContentPresenter();
    const mockBrowserSession = {
      navigate: vi.fn(),
      screenshot: vi.fn(),
      snapshot: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      scroll: vi.fn(),
      evaluate: vi.fn(),
      wait: vi.fn(),
      close: vi.fn(),
      isActive: vi.fn().mockReturnValue(false),
    } as any;
    tp = new ToolPresenter(fp, cp, mockBrowserSession);
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("injects SLIME_ROLE, SLIME_USER_ID, SLIME_DATA_DIR into exec env", async () => {
    tp.setSessionContext("s1", "hal-ai", "builtin");
    const tools = await tp.getToolSet("s1");
    const result = await tools.exec.execute({
      command: 'echo "$SLIME_ROLE|$SLIME_USER_ID|$SLIME_DATA_DIR"',
      timeout_ms: 5000,
    });
    expect(result.stdout.trim()).toBe("builtin-agent|hal-ai|/tmp/slime-userdata");
  });

  it("injects external-agent role for non-builtin agent", async () => {
    tp.setSessionContext("s2", "my-agent", "custom");
    const tools = await tp.getToolSet("s2");
    const result = await tools.exec.execute({
      command: 'echo "$SLIME_ROLE"',
      timeout_ms: 5000,
    });
    expect(result.stdout.trim()).toBe("external-agent");
  });
});
