import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const eventHandlers: Record<string, Function> = {};
const mockOn = vi.fn((channel: string, handler: Function) => {
  eventHandlers[channel] = handler;
  return vi.fn();
});

(globalThis as any).window = {
  electron: { ipcRenderer: { on: mockOn } },
};

import { useWorkflowStore, setupWorkflowIpc } from "@/stores/workflow";
import type { Workflow, WorkflowStep } from "@shared/types/workflow";
import { WORKFLOW_EVENTS } from "@shared/events";

describe("useWorkflowStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should start with null workflow", () => {
    const store = useWorkflowStore();
    expect(store.workflow).toBeNull();
  });

  it("should set workflow on UPDATED event", () => {
    const store = useWorkflowStore();
    const wf: Workflow = {
      sessionId: "s1",
      steps: [{ id: "a", title: "A", status: "pending" }],
    };
    store.setWorkflow(wf);
    expect(store.workflow).toEqual(wf);
  });

  it("should update step status", () => {
    const store = useWorkflowStore();
    store.setWorkflow({
      sessionId: "s1",
      steps: [{ id: "a", title: "A", status: "pending" }],
    });
    store.updateStep({ id: "a", title: "A", status: "completed" });
    expect(store.workflow!.steps[0].status).toBe("completed");
  });

  it("should ignore step update if no workflow", () => {
    const store = useWorkflowStore();
    store.updateStep({ id: "a", title: "A", status: "completed" });
    expect(store.workflow).toBeNull();
  });

  it("should reset workflow", () => {
    const store = useWorkflowStore();
    store.setWorkflow({
      sessionId: "s1",
      steps: [{ id: "a", title: "A", status: "pending" }],
    });
    store.reset();
    expect(store.workflow).toBeNull();
  });
});

describe("setupWorkflowIpc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockOn.mockClear();
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key];
  });

  it("should register IPC listeners and return cleanup", () => {
    const store = useWorkflowStore();
    const cleanup = setupWorkflowIpc(store);
    expect(typeof cleanup).toBe("function");
    expect(mockOn).toHaveBeenCalledWith(WORKFLOW_EVENTS.UPDATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(WORKFLOW_EVENTS.STEP_UPDATED, expect.any(Function));
    cleanup();
  });
});
