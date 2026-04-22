import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);
const eventHandlers: Record<string, Function> = {};
const mockOn = vi.fn((channel: string, handler: Function) => {
  eventHandlers[channel] = handler;
  return vi.fn(); // unsubscribe
});

(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() } },
};

import { useMessageStore } from "@/stores/chat";
import { setupMessageIpc } from "@/stores/messageIpc";
import { STREAM_EVENTS } from "@shared/events";

describe("messageIpc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockOn.mockClear();
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key];
  });

  it("should register stream event listeners", () => {
    const store = useMessageStore();
    setupMessageIpc(store);
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.RESPONSE, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.END, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.ERROR, expect.any(Function));
  });

  it("should update streaming state on RESPONSE event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    const blocks = [{ type: "content", content: "Hi", status: "loading", timestamp: 1 }];
    eventHandlers[STREAM_EVENTS.RESPONSE]("s1", "msg-1", blocks);

    expect(store.isStreaming).toBe(true);
    expect(store.streamingBlocks).toEqual(blocks);
  });

  it("should clear streaming state on END event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    // First set streaming
    store.setStreamingState("s1", "msg-1", []);
    // Then end
    mockInvoke.mockResolvedValue([]); // loadMessages will be called
    eventHandlers[STREAM_EVENTS.END]("s1", "msg-1");

    expect(store.isStreaming).toBe(false);
  });

  it("should clear streaming state on ERROR event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    store.setStreamingState("s1", "msg-1", []);
    eventHandlers[STREAM_EVENTS.ERROR]("s1", "some error");

    expect(store.isStreaming).toBe(false);
  });
});
