import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/models/agentMessageDao");
vi.mock("@/db/models/agentSessionDao");
vi.mock("@/db/models/agentSessionConfigDao");
vi.mock("@/db/models/agentDao");

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/presenter/agentChat/contextBuilder", () => ({
  buildContext: vi.fn(() => [
    { role: "system", content: "You are a helpful AI assistant." },
    { role: "user", content: "hello" },
  ]),
}));

import { streamText } from "ai";
import { eventBus } from "@/eventbus";
import * as messageDao from "@/db/models/agentMessageDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as agentDao from "@/db/models/agentDao";
import { CHAT_STREAM_EVENTS } from "@shared/events";
import { AgentChatPresenter } from "@/presenter/agentChat/agentChatPresenter";

// --- Helpers ---

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

function makeToolPresenter() {
  return {
    getToolSet: vi.fn(() => ({})),
    callTool: vi.fn(async () => "tool-result"),
  } as any;
}

function makeContentPresenter() {
  return {
    setContent: vi.fn(),
    clearContent: vi.fn(),
  } as any;
}

function mockStreamTextSimple(text: string, toolCalls: any[] = []) {
  async function* gen() {
    yield text;
  }
  vi.mocked(streamText).mockReturnValue({
    textStream: gen(),
    toolCalls: Promise.resolve(toolCalls),
  } as any);
}

function setupDefaultMocks() {
  vi.mocked(sessionDao.getSessionById).mockReturnValue({
    id: "sess-1",
    agentId: "agent-1",
    title: "Test",
    isPinned: false,
    sessionKind: "regular",
    parentSessionId: null,
    subagentMeta: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  vi.mocked(configDao.getConfigById).mockReturnValue(undefined);
  vi.mocked(agentDao.getAgentById).mockReturnValue({
    id: "agent-1",
    name: "Test",
    type: "builtin",
    enabled: true,
    protected: false,
    config: { capabilityRequirements: ["chat"] },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  vi.mocked(messageDao.getNextOrderSeq).mockReturnValue(1);
  vi.mocked(messageDao.createMessage).mockImplementation((_db, data) => ({
    id: data.id,
    sessionId: data.sessionId,
    orderSeq: data.orderSeq,
    role: data.role,
    content: data.content,
    status: (data.status ?? "pending") as any,
    isContextEdge: false,
    metadata: "{}",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  vi.mocked(sessionDao.updateTitle).mockReturnValue(undefined);
}

// --- Tests ---

describe("AgentChatPresenter", () => {
  let presenter: AgentChatPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    presenter = new AgentChatPresenter(
      makeGatewayPresenter(),
      makeToolPresenter(),
      makeContentPresenter(),
    );
  });

  describe("getSessionState", () => {
    it("returns idle by default", () => {
      expect(presenter.getSessionState("unknown")).toBe("idle");
    });
  });

  describe("chat", () => {
    it("saves user message and assistant message", async () => {
      mockStreamTextSimple("Hello!");
      await presenter.chat("sess-1", "hi");

      expect(messageDao.createMessage).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(messageDao.createMessage).mock.calls;
      expect(calls[0][1].role).toBe("user");
      expect(calls[0][1].content).toBe("hi");
      expect(calls[1][1].role).toBe("assistant");
    });

    it("sends END event on completion", async () => {
      mockStreamTextSimple("Done");
      await presenter.chat("sess-1", "test");

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        CHAT_STREAM_EVENTS.END,
        expect.objectContaining({ sessionId: "sess-1" }),
      );
    });

    it("sets state to generating then idle", async () => {
      mockStreamTextSimple("ok");
      const promise = presenter.chat("sess-1", "test");
      // During execution state is generating (hard to catch synchronously)
      await promise;
      expect(presenter.getSessionState("sess-1")).toBe("idle");
    });

    it("sends ERROR when no model configured", async () => {
      const gw = makeGatewayPresenter({
        select: vi.fn(() => ({ matched: {}, missing: ["chat"] })),
      });
      presenter = new AgentChatPresenter(gw, makeToolPresenter(), makeContentPresenter());

      await presenter.chat("sess-1", "test");

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        CHAT_STREAM_EVENTS.ERROR,
        expect.objectContaining({
          sessionId: "sess-1",
          error: expect.stringContaining("No model"),
        }),
      );
      expect(presenter.getSessionState("sess-1")).toBe("error");
    });

    it("returns early when session not found", async () => {
      vi.mocked(sessionDao.getSessionById).mockReturnValue(undefined);
      await presenter.chat("missing", "test");
      expect(messageDao.createMessage).not.toHaveBeenCalled();
      expect(presenter.getSessionState("missing")).toBe("error");
    });

    it("handles LLM error gracefully", async () => {
      vi.mocked(streamText).mockReturnValue({
        textStream: (async function* () {
          throw new Error("LLM failed");
        })(),
        toolCalls: Promise.resolve([]),
      } as any);

      await presenter.chat("sess-1", "test");

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        CHAT_STREAM_EVENTS.ERROR,
        expect.objectContaining({ sessionId: "sess-1", error: "LLM failed" }),
      );
      expect(presenter.getSessionState("sess-1")).toBe("error");
    });

    it("executes tool calls and loops", async () => {
      let callCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            textStream: (async function* () {
              yield "thinking...";
            })(),
            toolCalls: Promise.resolve([
              { toolCallId: "tc-1", toolName: "read", input: { path: "/tmp" } },
            ]),
          } as any;
        }
        return {
          textStream: (async function* () {
            yield "done";
          })(),
          toolCalls: Promise.resolve([]),
        } as any;
      });

      const tp = makeToolPresenter();
      presenter = new AgentChatPresenter(makeGatewayPresenter(), tp, makeContentPresenter());
      setupDefaultMocks();

      await presenter.chat("sess-1", "test");

      expect(tp.callTool).toHaveBeenCalledWith("sess-1", "read", { path: "/tmp" });
      expect(streamText).toHaveBeenCalledTimes(2);
    });

    it("respects MAX_STEPS limit", async () => {
      // Always return a tool call to force looping
      vi.mocked(streamText).mockImplementation(
        () =>
          ({
            textStream: (async function* () {
              yield "";
            })(),
            toolCalls: Promise.resolve([
              { toolCallId: `tc-${Date.now()}`, toolName: "read", input: { path: "/" } },
            ]),
          }) as any,
      );

      const tp = makeToolPresenter();
      presenter = new AgentChatPresenter(makeGatewayPresenter(), tp, makeContentPresenter());
      setupDefaultMocks();

      await presenter.chat("sess-1", "test");

      // Should cap at 128
      expect(vi.mocked(streamText).mock.calls.length).toBe(128);
    });
  });

  describe("stopGeneration", () => {
    it("sets state to idle", () => {
      presenter.stopGeneration("sess-1");
      expect(presenter.getSessionState("sess-1")).toBe("idle");
    });

    it("resolves pending question with cancelled", async () => {
      let resolved = "";
      const promise = new Promise<void>((done) => {
        // Access private pendingQuestions via chat + ask_user
        (presenter as any).pendingQuestions.set("sess-1", {
          toolCallId: "tc-1",
          resolve: (answer: string) => {
            resolved = answer;
            done();
          },
        });
      });
      presenter.stopGeneration("sess-1");
      await promise;
      expect(resolved).toBe("[User cancelled]");
    });
  });

  describe("answerQuestion", () => {
    it("resolves matching pending question", async () => {
      let resolved = "";
      const promise = new Promise<void>((done) => {
        (presenter as any).pendingQuestions.set("sess-1", {
          toolCallId: "tc-1",
          resolve: (answer: string) => {
            resolved = answer;
            done();
          },
        });
      });
      presenter.answerQuestion("sess-1", "tc-1", "yes");
      await promise;
      expect(resolved).toBe("yes");
    });

    it("ignores mismatched toolCallId", () => {
      (presenter as any).pendingQuestions.set("sess-1", {
        toolCallId: "tc-1",
        resolve: vi.fn(),
      });
      presenter.answerQuestion("sess-1", "tc-wrong", "yes");
      // Should not have been removed
      expect((presenter as any).pendingQuestions.has("sess-1")).toBe(true);
    });
  });

  // BUG-B 复现：stopGeneration 触发 abort 后，已收到的 streaming blocks 不会落 DB。
  // 当前实现：abort 分支 catch 里直接推 END 事件然后 return，不写 assistant 消息到 DB。
  it("saves assistant message to DB even when generation is aborted mid-stream", async () => {
    // 模拟 stream 收到第一个 chunk 后由 abort signal 结束（collectStreamResult 里 break）
    vi.mocked(streamText).mockImplementation(({ abortSignal }: any) => {
      return {
        textStream: (async function* () {
          yield "partial answer";
          // 等待 abort，然后退出（模拟 collectStreamResult 的 break 分支）
          await new Promise<void>((resolve) => {
            if (abortSignal.aborted) {
              resolve();
              return;
            }
            abortSignal.addEventListener("abort", resolve);
          });
        })(),
        toolCalls: Promise.resolve([]),
      } as any;
    });

    const chatPromise = presenter.chat("sess-1", "hello");
    // 等 stream 推第一个 chunk
    await new Promise((r) => setTimeout(r, 20));
    // 此时 blocks 已有 "partial answer" 内容
    presenter.stopGeneration("sess-1");
    await chatPromise;

    // assistant 消息必须写入 DB（BUG-B：当前不写 → 红灯）
    const calls = vi.mocked(messageDao.createMessage).mock.calls;
    const assistantCall = calls.find((c) => c[1].role === "assistant");
    expect(assistantCall).toBeDefined();
  });

  // BUG-D 复现：当 sessionId 已在 generating 状态时，第二次 chat() 调用应直接返回，不再进入 loop。
  it("ignores concurrent chat() calls for the same session", async () => {
    // 第一个 chat() 挂起（stream 不结束）
    let resolveStream!: () => void;
    let callCount = 0;
    vi.mocked(streamText).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          textStream: (async function* () {
            yield "thinking...";
            await new Promise<void>((r) => {
              resolveStream = r;
            });
          })(),
          toolCalls: Promise.resolve([]),
        } as any;
      }
      // 第二次调用（不应触发，但如果触发了，立即结束以免挂住测试）
      return {
        textStream: (async function* () {
          yield "second";
        })(),
        toolCalls: Promise.resolve([]),
      } as any;
    });

    const first = presenter.chat("sess-1", "first");
    // 等 state 变为 generating
    await new Promise((r) => setTimeout(r, 5));
    expect(presenter.getSessionState("sess-1")).toBe("generating");

    // 第二次调用必须立即返回（状态 generating → 直接 return）
    // BUG-D：当前无保护，会调第二次 streamText → callCount 变成 2 → 红灯
    await presenter.chat("sess-1", "second");
    expect(callCount).toBe(1); // streamText 只应被调一次

    // 收尾
    resolveStream();
    await first;
  }, 8000);

  describe("retryLastMessage", () => {
    it("does nothing when no assistant message", async () => {
      vi.mocked(messageDao.listBySession).mockReturnValue([]);
      await presenter.retryLastMessage("sess-1");
      expect(messageDao.updateMessage).not.toHaveBeenCalled();
    });
  });

  it("marks last content block as is_final before saving", async () => {
    // loop: text → tool call → text (final)
    let callCount = 0;
    vi.mocked(streamText).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        async function* gen() {
          yield "let me check";
        }
        return {
          textStream: gen(),
          toolCalls: Promise.resolve([
            { toolCallId: "tc1", toolName: "exec", input: { command: "date" } },
          ]),
        } as any;
      }
      async function* gen() {
        yield "today is Tuesday";
      }
      return { textStream: gen(), toolCalls: Promise.resolve([]) } as any;
    });

    vi.mocked(messageDao.getNextOrderSeq).mockReturnValue(2);
    vi.mocked(messageDao.createMessage).mockImplementation(() => {});

    const gw = makeGatewayPresenter();
    const tool = makeToolPresenter();
    const content = makeContentPresenter();
    const p = new AgentChatPresenter(gw, tool, content);

    await p.chat("sess-1", "what day");

    const calls = vi.mocked(messageDao.createMessage).mock.calls;
    const assistantCall = calls.find((c) => c[1].role === "assistant");
    expect(assistantCall).toBeDefined();
    const blocks = JSON.parse(assistantCall![1].content);
    const contentBlocks = blocks.filter((b: any) => b.type === "content");
    expect(contentBlocks.length).toBeGreaterThanOrEqual(2);
    const lastContent = contentBlocks[contentBlocks.length - 1];
    expect(lastContent.is_final).toBe(true);
    expect(contentBlocks[0].is_final).toBeUndefined();
  });
});
