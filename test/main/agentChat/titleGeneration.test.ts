import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/models/agentSessionDao");
vi.mock("@/db/models/agentSessionConfigDao");
vi.mock("@/db/models/agentMessageDao");
vi.mock("@/db/models/agentDao");

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

import { generateText } from "ai";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as messageDao from "@/db/models/agentMessageDao";
import { eventBus } from "@/eventbus";
import { SESSION_EVENTS } from "@shared/events";
import { AgentChatPresenterAdapter } from "@/presenter/agentChatPresenterAdapter";

// --- Helpers ---

function makeEngine() {
  return {
    chat: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    retryLastMessage: vi.fn(),
    answerQuestion: vi.fn(),
    getSessionState: vi.fn(() => "idle" as const),
  } as any;
}

function makeGatewayPresenter(overrides?: Partial<Record<string, any>>) {
  return {
    getPort: vi.fn(() => 8930),
    getInternalKey: vi.fn(() => "sk-test"),
    select: vi.fn(() => ({
      matched: { chat: { groupName: "test-group", channelId: 1, capabilities: ["chat"] } },
      missing: [],
    })),
    ...overrides,
  } as any;
}

function makeSession(overrides?: Partial<Record<string, any>>) {
  return {
    id: "sess-1",
    agentId: "agent-1",
    title: "新对话",
    isPinned: false,
    sessionKind: "regular",
    parentSessionId: null,
    subagentMeta: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// --- Tests ---

describe("AgentChatPresenterAdapter generateTitle", () => {
  let adapter: AgentChatPresenterAdapter;
  let engine: ReturnType<typeof makeEngine>;
  let gw: ReturnType<typeof makeGatewayPresenter>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = makeEngine();
    gw = makeGatewayPresenter();
    adapter = new AgentChatPresenterAdapter(engine, gw);

    vi.mocked(sessionDao.getSessionById).mockReturnValue(makeSession());
    vi.mocked(messageDao.listBySession).mockReturnValue([]);
    vi.mocked(sessionDao.updateTitle).mockReturnValue(undefined);
    vi.mocked(sessionDao.updateMetadata).mockReturnValue(undefined);
    vi.mocked(generateText).mockResolvedValue({ text: "测试标题" } as any);
  });

  it("skips when titleManuallyEdited is true", async () => {
    vi.mocked(sessionDao.getSessionById).mockReturnValue(
      makeSession({ metadata: { titleManuallyEdited: true } }),
    );

    await (adapter as any).generateTitle("sess-1", "hello");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips when titleGeneratedCount >= 3", async () => {
    vi.mocked(sessionDao.getSessionById).mockReturnValue(
      makeSession({ metadata: { titleGeneratedCount: 3 } }),
    );

    await (adapter as any).generateTitle("sess-1", "hello");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("calls generateText when conditions are met", async () => {
    await (adapter as any).generateTitle("sess-1", "hello");

    expect(generateText).toHaveBeenCalled();
  });

  it("updates title and metadata on success", async () => {
    await (adapter as any).generateTitle("sess-1", "hello");

    expect(sessionDao.updateTitle).toHaveBeenCalledWith(expect.anything(), "sess-1", "测试标题");
    expect(sessionDao.updateMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ titleGeneratedCount: 1 }),
    );
    expect(eventBus.sendToRenderer).toHaveBeenCalledWith(SESSION_EVENTS.LIST_UPDATED, null);
  });

  it("skips when no chat model matched", async () => {
    const gwNoModel = makeGatewayPresenter({
      select: vi.fn(() => ({ matched: {}, missing: ["chat"] })),
    });
    adapter = new AgentChatPresenterAdapter(engine, gwNoModel);

    await (adapter as any).generateTitle("sess-1", "hello");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips when session not found", async () => {
    vi.mocked(sessionDao.getSessionById).mockReturnValue(undefined);

    await (adapter as any).generateTitle("sess-1", "hello");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("silently ignores generateText errors", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("LLM failed"));

    await (adapter as any).generateTitle("sess-1", "hello");

    expect(sessionDao.updateTitle).not.toHaveBeenCalled();
  });

  it("uses up to 3 user messages for prompt", async () => {
    vi.mocked(messageDao.listBySession).mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "reply1" },
      { role: "user", content: "msg2" },
      { role: "user", content: "msg3" },
    ] as any[]);

    await (adapter as any).generateTitle("sess-1", "msg4");

    const call = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(call.prompt).toContain("用户：msg1");
    expect(call.prompt).toContain("用户：msg2");
    expect(call.prompt).toContain("用户：msg3");
    // msg4 is the current message, but we only take 3 total
    expect(call.prompt).not.toContain("用户：msg4");
  });

  it("fires generateTitle in chat() as fire-and-forget", async () => {
    await adapter.chat("sess-1", "hello");

    expect(engine.chat).toHaveBeenCalledWith("sess-1", "hello");
    // generateTitle was kicked off (fire-and-forget, so we just check it was called)
    expect(sessionDao.getSessionById).toHaveBeenCalled();
  });
});
