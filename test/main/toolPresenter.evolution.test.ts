import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test" },
}));

vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, cb) => cb(null, "", "")),
}));

import { ToolPresenter } from "../../src/main/presenter/toolPresenter";

function mockFile() {
  return { read: vi.fn(), write: vi.fn(), edit: vi.fn() } as any;
}

function mockContent() {
  return { openFile: vi.fn() } as any;
}

function mockEvolution() {
  return {
    startEvolution: vi.fn().mockReturnValue(true),
    submitPlan: vi.fn().mockReturnValue(true),
    completeEvolution: vi.fn().mockResolvedValue({ success: true, tag: "egg-v0.1-dev.1" }),
    getStatus: vi.fn().mockReturnValue({ stage: "idle" }),
  } as any;
}

describe("ToolPresenter evolution tools", () => {
  let tp: ToolPresenter;

  beforeEach(() => {
    tp = new ToolPresenter(mockFile(), mockContent(), mockEvolution());
  });

  it("has evolution_start tool", () => {
    const tools = tp.getToolSet("s1");
    expect(tools).toHaveProperty("evolution_start");
  });

  it("has evolution_plan tool", () => {
    const tools = tp.getToolSet("s1");
    expect(tools).toHaveProperty("evolution_plan");
  });

  it("has evolution_complete tool", () => {
    const tools = tp.getToolSet("s1");
    expect(tools).toHaveProperty("evolution_complete");
  });

  it("does NOT have workflow_edit tool", () => {
    const tools = tp.getToolSet("s1");
    expect(tools).not.toHaveProperty("workflow_edit");
  });

  it("does NOT have step_update tool", () => {
    const tools = tp.getToolSet("s1");
    expect(tools).not.toHaveProperty("step_update");
  });

  it("evolution_start calls presenter", async () => {
    const evo = mockEvolution();
    tp = new ToolPresenter(mockFile(), mockContent(), evo);
    await tp.callTool("s1", "evolution_start", { description: "test" });
    expect(evo.startEvolution).toHaveBeenCalledWith("test");
  });

  it("evolution_complete calls presenter", async () => {
    const evo = mockEvolution();
    tp = new ToolPresenter(mockFile(), mockContent(), evo);
    await tp.callTool("s1", "evolution_complete", { summary: "done" });
    expect(evo.completeEvolution).toHaveBeenCalledWith("done");
  });
});
