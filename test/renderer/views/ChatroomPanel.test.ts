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

  // BUG-#1: NewThread 新建会话后 activeSessionId 变化，thought chain 状态必须清零
  it("resets thought chain state when activeSessionId changes (covers NewThread path)", async () => {
    const wrapper = mount(ChatroomPanel);
    await flushPromises();

    const sessionStore = useAgentSessionStore();
    const chatStore = useAgentChatStore();

    // 先进入有会话的状态，ChatView 才会渲染
    sessionStore.activeSessionId = "session-1";
    await flushPromises();

    // 设置流式状态，模拟 thought chain 已打开
    chatStore.isGenerating = true;
    chatStore.streamingBlocks = [
      { type: "content", content: "thinking", status: "loading", timestamp: 1 } as any,
    ];

    // 触发 show-thought-chain（不带 messageId = 流式进度）
    const chatView = wrapper.findComponent({ name: "ChatView" });
    await chatView.vm.$emit("show-thought-chain");
    await flushPromises();

    let panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    expect(panel.props("thoughtChainBlocks")).not.toBeNull();

    // 切换到新会话（模拟 NewThread.createSession 直接写 activeSessionId）
    sessionStore.activeSessionId = "new-session-id";
    await flushPromises();

    panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    expect(panel.props("thoughtChainBlocks")).toBeNull();
    expect(panel.props("selectedToolCallId")).toBeNull();
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

  // BUG-#2: 流式状态下 thoughtChainBlocks 应返回全部 streamingBlocks，不过滤 is_final
  it("returns all streamingBlocks as thoughtChainBlocks (no is_final filtering during streaming)", async () => {
    const wrapper = mount(ChatroomPanel);
    await flushPromises();

    const sessionStore = useAgentSessionStore();
    const chatStore = useAgentChatStore();

    sessionStore.activeSessionId = "session-1";
    await flushPromises();

    const blocks = [
      { type: "content", content: "step 1", status: "loading", timestamp: 1 },
      {
        type: "tool_call",
        id: "tc1",
        status: "loading",
        timestamp: 2,
        tool_call: { id: "tc1", name: "exec", input: {} },
      },
    ];
    chatStore.isGenerating = true;
    chatStore.streamingBlocks = blocks as any;

    const chatView = wrapper.findComponent({ name: "ChatView" });
    await chatView.vm.$emit("show-thought-chain");
    await flushPromises();

    const panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    const thoughtBlocks = panel.props("thoughtChainBlocks") as any[];
    expect(thoughtBlocks).toHaveLength(2);
    expect(thoughtBlocks[0].content).toBe("step 1");
  });

  // BUG-#2 补充: 即使 streamingBlocks 中有 is_final=true 的 block 也不过滤
  it("includes is_final blocks from streamingBlocks in thoughtChainBlocks", async () => {
    const wrapper = mount(ChatroomPanel);
    await flushPromises();

    const sessionStore = useAgentSessionStore();
    const chatStore = useAgentChatStore();

    sessionStore.activeSessionId = "session-1";
    await flushPromises();

    const blocks = [
      { type: "content", content: "intermediate", status: "success", timestamp: 1 },
      { type: "content", content: "final answer", status: "success", timestamp: 2, is_final: true },
    ];
    chatStore.isGenerating = true;
    chatStore.streamingBlocks = blocks as any;

    const chatView = wrapper.findComponent({ name: "ChatView" });
    await chatView.vm.$emit("show-thought-chain");
    await flushPromises();

    const panel = wrapper.findComponent({ name: "ChatFunctionPanel" });
    const thoughtBlocks = panel.props("thoughtChainBlocks") as any[];
    // 流式阶段不过滤，两个 block 都应存在
    expect(thoughtBlocks).toHaveLength(2);
    expect(thoughtBlocks[1].is_final).toBe(true);
  });
});
