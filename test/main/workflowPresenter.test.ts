import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: mockSendToRenderer },
}));

const { WorkflowPresenter } = await import("@/presenter/workflowPresenter");

describe("WorkflowPresenter", () => {
  let wp: InstanceType<typeof WorkflowPresenter>;

  beforeEach(() => {
    wp = new WorkflowPresenter();
    mockSendToRenderer.mockClear();
  });

  it("should create workflow with pending steps", () => {
    const result = wp.editWorkflow("s1", [
      { id: "a", title: "Step A" },
      { id: "b", title: "Step B", description: "desc" },
    ]);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe("pending");
    expect(result.steps[1].description).toBe("desc");
    expect(mockSendToRenderer).toHaveBeenCalledWith(
      "workflow:updated",
      "s1",
      expect.objectContaining({ sessionId: "s1" }),
    );
  });

  it("should overwrite existing workflow", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "Old" }]);
    const result = wp.editWorkflow("s1", [{ id: "x", title: "New" }]);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].id).toBe("x");
  });

  it("should query workflow", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "A" }]);
    const result = wp.queryWorkflow("s1");
    expect(result).not.toBeNull();
    expect(result!.steps[0].id).toBe("a");
  });

  it("should return null for unknown session", () => {
    expect(wp.queryWorkflow("unknown")).toBeNull();
  });

  it("should query single step", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "A" }]);
    const step = wp.queryStep("s1", "a");
    expect(step).not.toBeNull();
    expect(step!.title).toBe("A");
  });

  it("should return null for unknown step", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "A" }]);
    expect(wp.queryStep("s1", "unknown")).toBeNull();
  });

  it("should update step status", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "A" }]);
    const step = wp.updateStep("s1", "a", "in_progress");
    expect(step).not.toBeNull();
    expect(step!.status).toBe("in_progress");
    expect(mockSendToRenderer).toHaveBeenCalledWith(
      "workflow:step-updated",
      "s1",
      expect.objectContaining({ id: "a", status: "in_progress" }),
    );
  });

  it("should return null when updating unknown step", () => {
    wp.editWorkflow("s1", [{ id: "a", title: "A" }]);
    expect(wp.updateStep("s1", "unknown", "completed")).toBeNull();
  });
});
