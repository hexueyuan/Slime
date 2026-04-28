import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { setupAgentChatIpc } from "@/stores/agentChatIpc";
import { CHAT_STREAM_EVENTS } from "@shared/events";

// ----- IPC mock -----
type IpcHandler = (data: unknown) => void;
const ipcHandlers: Record<string, IpcHandler[]> = {};

const mockIpcOn = vi.fn((event: string, handler: IpcHandler) => {
  if (!ipcHandlers[event]) ipcHandlers[event] = [];
  ipcHandlers[event].push(handler);
  // 返回 cleanup 函数
  return () => {
    ipcHandlers[event] = ipcHandlers[event].filter((h) => h !== handler);
  };
});

function emitIpc(event: string, data: unknown) {
  (ipcHandlers[event] ?? []).forEach((h) => h(data));
}

(globalThis as any).window = {
  electron: {
    ipcRenderer: { on: mockIpcOn, invoke: vi.fn(), removeAllListeners: vi.fn() },
  },
};

// ----- Store stub -----
function makeStore(overrides?: Partial<ReturnType<typeof makeStore>>) {
  return {
    isGenerating: false,
    error: null as string | null,
    setStreamingState: vi.fn(),
    clearStreamingState: vi.fn(),
    setError: vi.fn(function (this: any, e: string) {
      this.error = e;
      this.isGenerating = false;
    }),
    fetchMessages: vi.fn(),
    ...overrides,
  } as any;
}

describe("setupAgentChatIpc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k]);
    mockIpcOn.mockClear();
  });

  it("sets streaming state only for active session", () => {
    const store = makeStore();
    setupAgentChatIpc(store, () => "sess-active");

    emitIpc(CHAT_STREAM_EVENTS.RESPONSE, { sessionId: "sess-other", messageId: "m1", blocks: [] });
    expect(store.setStreamingState).not.toHaveBeenCalled();

    emitIpc(CHAT_STREAM_EVENTS.RESPONSE, {
      sessionId: "sess-active",
      messageId: "m1",
      blocks: [{ type: "content", content: "hi" }],
    });
    expect(store.setStreamingState).toHaveBeenCalledTimes(1);
  });

  // BUG-C 复现：END 事件来自其他 session 时不应重置当前 session 的 isGenerating。
  it("does not reset isGenerating when END event is from a different session", () => {
    const store = makeStore();
    store.isGenerating = true;

    setupAgentChatIpc(store, () => "sess-active");
    emitIpc(CHAT_STREAM_EVENTS.END, { sessionId: "sess-other", messageId: "m99" });

    // BUG-C：当前实现无条件 store.isGenerating = false → 红灯
    expect(store.isGenerating).toBe(true);
    expect(store.fetchMessages).not.toHaveBeenCalled();
  });

  it("resets isGenerating and fetches messages when END is for active session", () => {
    const store = makeStore();
    store.isGenerating = true;

    setupAgentChatIpc(store, () => "sess-active");
    emitIpc(CHAT_STREAM_EVENTS.END, { sessionId: "sess-active", messageId: "m1" });

    expect(store.isGenerating).toBe(false);
    expect(store.clearStreamingState).toHaveBeenCalled();
    expect(store.fetchMessages).toHaveBeenCalledWith("sess-active");
  });

  it("sets error only for active session", () => {
    const store = makeStore();
    setupAgentChatIpc(store, () => "sess-active");

    emitIpc(CHAT_STREAM_EVENTS.ERROR, { sessionId: "sess-other", error: "fail" });
    expect(store.setError).not.toHaveBeenCalled();

    emitIpc(CHAT_STREAM_EVENTS.ERROR, { sessionId: "sess-active", error: "oops" });
    expect(store.setError).toHaveBeenCalledWith("oops");
  });

  it("returns cleanup function that removes listeners", () => {
    const store = makeStore();
    const cleanup = setupAgentChatIpc(store, () => "sess-active");

    cleanup();
    // 触发事件后不再有任何响应
    emitIpc(CHAT_STREAM_EVENTS.RESPONSE, { sessionId: "sess-active", messageId: "m1", blocks: [] });
    expect(store.setStreamingState).not.toHaveBeenCalled();
  });
});
