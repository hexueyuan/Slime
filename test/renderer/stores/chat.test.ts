import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);
const mockOn = vi.fn(() => vi.fn()); // 返回 unsubscribe 函数

(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() } },
};

import { useMessageStore } from "@/stores/chat";
import type { AssistantMessageBlock, ChatMessageRecord } from "@shared/types/chat";

describe("messageStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockOn.mockClear();
  });

  it("should start with empty state", () => {
    const store = useMessageStore();
    expect(store.messageIds).toEqual([]);
    expect(store.isStreaming).toBe(false);
    expect(store.streamingBlocks).toEqual([]);
  });

  it("should load messages via IPC", async () => {
    const mockMessages: ChatMessageRecord[] = [
      {
        id: "m1",
        sessionId: "s1",
        role: "user",
        content: JSON.stringify({ text: "hello", files: [] }),
        status: "sent",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    mockInvoke.mockResolvedValueOnce(mockMessages);

    const store = useMessageStore();
    await store.loadMessages("s1");

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "getMessages",
      "s1",
    );
    expect(store.messageIds).toEqual(["m1"]);
    expect(store.getMessage("m1")).toEqual(mockMessages[0]);
  });

  it("should add optimistic user message", () => {
    const store = useMessageStore();
    store.addOptimisticUserMessage("s1", { text: "hello", files: [] });
    expect(store.messageIds).toHaveLength(1);
    const msg = store.getMessage(store.messageIds[0]);
    expect(msg?.role).toBe("user");
    expect(msg?.status).toBe("sent");
  });

  it("should set streaming blocks", () => {
    const store = useMessageStore();
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "Hello", status: "loading", timestamp: Date.now() },
    ];
    store.setStreamingState("s1", "msg-1", blocks);
    expect(store.isStreaming).toBe(true);
    expect(store.streamingBlocks).toEqual(blocks);
    expect(store.currentStreamMessageId).toBe("msg-1");
  });

  it("should clear streaming state", () => {
    const store = useMessageStore();
    store.setStreamingState("s1", "msg-1", []);
    store.clearStreamingState();
    expect(store.isStreaming).toBe(false);
    expect(store.streamingBlocks).toEqual([]);
    expect(store.currentStreamMessageId).toBeNull();
  });

  it("should send message via IPC", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const store = useMessageStore();
    await store.sendMessage("s1", { text: "hello", files: [] });
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "agentPresenter", "chat", "s1", {
      text: "hello",
      files: [],
    });
  });

  it("should stop generation via IPC", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const store = useMessageStore();
    await store.stopGeneration("s1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "agentPresenter",
      "stopGeneration",
      "s1",
    );
  });
});
