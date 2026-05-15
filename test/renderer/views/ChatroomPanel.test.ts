import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

// --- IPC mock ---
const mockInvoke = vi.fn();
(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

// --- Stub heavy child components ---
vi.mock("@/components/chat/SessionList.vue", () => ({
  default: {
    name: "SessionList",
    emits: ["select"],
    template: '<div data-testid="session-list" />',
  },
}));
vi.mock("@/components/chat/NewThread.vue", () => ({
  default: {
    name: "NewThread",
    template: '<div data-testid="new-thread" />',
  },
}));
vi.mock("@/components/chat/ChatView.vue", () => ({
  default: {
    name: "ChatView",
    props: ["selectedToolCallId"],
    emits: ["open-agent-edit", "select-tool-call", "show-thought-chain"],
    template: '<div data-testid="chat-view" />',
  },
}));
vi.mock("@/components/chat/ChatFunctionPanel.vue", () => ({
  default: {
    name: "ChatFunctionPanel",
    props: ["activeTab", "toolCallBlocks", "selectedToolCallId", "thoughtChainBlocks"],
    emits: ["update:activeTab", "select-tool-call"],
    template: '<div data-testid="chat-function-panel" />',
  },
}));
vi.mock("@/components/chat/AgentEditDialog.vue", () => ({
  default: {
    name: "AgentEditDialog",
    props: ["open", "agentId"],
    emits: ["update:open", "saved"],
    template: '<div data-testid="agent-edit-dialog" />',
  },
}));
vi.mock("@/composables/useSplitPane", () => ({
  useSplitPane: () => ({
    leftWidth: 500,
    onMouseDown: vi.fn(),
    resetToDefault: vi.fn(),
  }),
}));
vi.mock("@/stores/agentChatIpc", () => ({
  setupAgentChatIpc: vi.fn(() => vi.fn()),
}));

import ChatroomPanel from "@/views/ChatroomPanel.vue";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";

function makeInvokeMock() {
  return async (channel: string, ...args: unknown[]) => {
    if (channel === "presenter:call") {
      const [presenter, method] = args as [string, string];
      if (presenter === "agentPresenter" && method === "getAgents") return [];
      if (presenter === "agentChatPresenter" && method === "getSessions") return [];
      if (presenter === "agentChatPresenter" && method === "getMessages") return [];
    }
    return null;
  };
}

describe("ChatroomPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(makeInvokeMock());
  });
  // BUG-#1 补充: SessionList 切换会话（经 onSessionSelect）也应清零
  it("resets thought chain state when switching session via SessionList", async () => {
    const wrapper = mount(ChatroomPanel);
    await flushPromises();

    const sessionStore = useAgentSessionStore();
    const chatStore = useAgentChatStore();

    sessionStore.activeSessionId = "session-1";
    await flushPromises();

    chatStore.isGenerating = true;
    chatStore.streamingBlocks = [
      { type: "content", content: "thinking", status: "loading", timestamp: 1 } as any,
    ];

    const chatView = wrapper.findComponent({ name: "ChatView" });
    await chatView.vm.$emit("show-thought-chain");
    await flushPromises();

    let panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    expect(panel.props("thoughtChainBlocks")).not.toBeNull();

    // 通过 SessionList 切换会话
    const sessionList = wrapper.findComponent({ name: "SessionList" });
    await sessionList.vm.$emit("select", "other-session");
    await flushPromises();

    panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    expect(panel.props("thoughtChainBlocks")).toBeNull();
  });
});
