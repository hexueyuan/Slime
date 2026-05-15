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
  it("returns cleanup function that removes listeners", () => {
    const store = makeStore();
    const cleanup = setupAgentChatIpc(store, () => "sess-active");

    cleanup();
    // 触发事件后不再有任何响应
    emitIpc(CHAT_STREAM_EVENTS.RESPONSE, { sessionId: "sess-active", messageId: "m1", blocks: [] });
    expect(store.setStreamingState).not.toHaveBeenCalled();
  });
});
