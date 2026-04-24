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

import { useContentStore, setupContentIpc } from "@/stores/content";
import { CONTENT_EVENTS } from "@shared/events";

describe("useContentStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should start with null content", () => {
    const store = useContentStore();
    expect(store.content).toBeNull();
  });

  it("should set content", () => {
    const store = useContentStore();
    store.setContent({ type: "markdown", content: "# Hi" });
    expect(store.content).toEqual({ type: "markdown", content: "# Hi" });
  });

  it("should clear content", () => {
    const store = useContentStore();
    store.setContent({ type: "markdown", content: "# Hi" });
    store.clear();
    expect(store.content).toBeNull();
  });
});

describe("setupContentIpc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockOn.mockClear();
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key];
  });

  it("should register IPC listeners and return cleanup", () => {
    const store = useContentStore();
    const cleanup = setupContentIpc(store);
    expect(typeof cleanup).toBe("function");
    expect(mockOn).toHaveBeenCalledWith(CONTENT_EVENTS.UPDATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(CONTENT_EVENTS.CLEARED, expect.any(Function));
    cleanup();
  });

  it("should update content on UPDATED event", () => {
    const store = useContentStore();
    setupContentIpc(store);
    const handler = eventHandlers[CONTENT_EVENTS.UPDATED];
    handler("s1", { type: "progress", percentage: 50, label: "building", stage: "coding" });
    expect(store.content).toEqual({
      type: "progress",
      percentage: 50,
      label: "building",
      stage: "coding",
    });
  });

  it("should clear content on CLEARED event", () => {
    const store = useContentStore();
    store.setContent({ type: "markdown", content: "hi" });
    setupContentIpc(store);
    const handler = eventHandlers[CONTENT_EVENTS.CLEARED];
    handler("s1");
    expect(store.content).toBeNull();
  });
});
