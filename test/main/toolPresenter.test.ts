import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils/paths", () => ({
  paths: { projectRoot: process.cwd() },
}));

const { ToolPresenter } = await import("@/presenter/toolPresenter");
const { FilePresenter } = await import("@/presenter/filePresenter");
const { WorkflowPresenter } = await import("@/presenter/workflowPresenter");

describe("ToolPresenter", () => {
  const testRoot = join(tmpdir(), `slime-tool-test-${Date.now()}`);
  let tp: InstanceType<typeof ToolPresenter>;

  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
    const fp = new FilePresenter(testRoot);
    const wp = new WorkflowPresenter();
    tp = new ToolPresenter(fp, wp);
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("should return a ToolSet with all 8 tools", () => {
    const tools = tp.getToolSet("s1");
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "read",
        "write",
        "edit",
        "exec",
        "workflow_edit",
        "workflow_query",
        "step_query",
        "step_update",
      ]),
    );
    expect(Object.keys(tools)).toHaveLength(8);
  });

  it("should execute read tool", async () => {
    writeFileSync(join(testRoot, "test.txt"), "hello");
    const result = await tp.callTool("s1", "read", { path: "test.txt" });
    expect(result).toBe("hello");
  });

  it("should execute write tool", async () => {
    const result = await tp.callTool("s1", "write", { path: "out.txt", content: "written" });
    expect(result).toBe("Written to out.txt");
  });

  it("should execute edit tool", async () => {
    writeFileSync(join(testRoot, "code.ts"), "const x = 1;");
    const result = await tp.callTool("s1", "edit", {
      path: "code.ts",
      old_text: "const x = 1;",
      new_text: "const x = 2;",
    });
    expect(result).toBe("Edited code.ts");
  });

  it("should execute exec tool", async () => {
    const result = (await tp.callTool("s1", "exec", { command: "echo hello" })) as any;
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exit_code).toBe(0);
  });

  it("should execute workflow_edit tool", async () => {
    const result = (await tp.callTool("s1", "workflow_edit", {
      steps: [{ id: "a", title: "Step A" }],
    })) as any;
    expect(result.steps).toHaveLength(1);
  });

  it("should execute workflow_query tool", async () => {
    await tp.callTool("s1", "workflow_edit", {
      steps: [{ id: "a", title: "Step A" }],
    });
    const result = await tp.callTool("s1", "workflow_query", {});
    expect(result).not.toBeNull();
  });

  it("should execute step_update tool", async () => {
    await tp.callTool("s1", "workflow_edit", {
      steps: [{ id: "a", title: "Step A" }],
    });
    const result = (await tp.callTool("s1", "step_update", {
      step_id: "a",
      status: "completed",
    })) as any;
    expect(result.status).toBe("completed");
  });

  it("should throw on unknown tool", async () => {
    await expect(tp.callTool("s1", "unknown", {})).rejects.toThrow("Unknown tool");
  });
});
