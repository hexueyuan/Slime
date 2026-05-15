import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/llm", () => ({
  createLLMClient: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/models/agentMessageDao");
vi.mock("@/db/models/agentSessionDao");
vi.mock("@/db/models/agentSessionConfigDao");
vi.mock("@/agents/agentRegistry", () => ({
  agentRegistry: {
    getById: vi.fn(),
  },
}));

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  paths: { sessionWorkDir: vi.fn((sessionId: string) => `/tmp/slime-sessions/${sessionId}`) },
}));

vi.mock("@/presenter/agentChat/contextBuilder", () => ({
  buildContext: vi.fn(() => [
    { role: "system", content: "You are a helpful AI assistant." },
    { role: "user", content: "hello" },
  ]),
}));

import { createLLMClient } from "@/llm";
import { eventBus } from "@/eventbus";
import * as messageDao from "@/db/models/agentMessageDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import { agentRegistry } from "@/agents/agentRegistry";
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
    setSessionContext: vi.fn(),
  } as any;
}

function makeContentPresenter() {
  return {
    setContent: vi.fn(),
    clearContent: vi.fn(),
  } as any;
}

async function* textGen(text: string) {
  yield { type: "text" as const, text };
}

async function* toolCallGen(id: string, name: string, input: unknown) {
  yield { type: "tool_call_start" as const, id, name };
  yield { type: "tool_call_end" as const, id, input };
}

async function* concatGen(...gens: AsyncGenerator<any>[]) {
  for (const gen of gens) yield* gen;
}

function mockClientSimple(text: string) {
  const mockClient = {
    chat: vi.fn(async function* () {
      yield { type: "text", text };
    }),
  };
  vi.mocked(createLLMClient).mockReturnValue(mockClient as any);
  return mockClient;
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
  vi.mocked(agentRegistry.getById).mockReturnValue({
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

  describe("chat", () => {
    it("sends END event on completion", async () => {
      mockClientSimple("Done");
      await presenter.chat("sess-1", "test");

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        CHAT_STREAM_EVENTS.END,
        expect.objectContaining({ sessionId: "sess-1" }),
      );
    });

    it("sets state to generating then idle", async () => {
      mockClientSimple("ok");
      const promise = presenter.chat("sess-1", "test");
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
      const mockClient = {
        chat: vi.fn(async function* () {
          yield { type: "error", error: "LLM failed" };
        }),
      };
      vi.mocked(createLLMClient).mockReturnValue(mockClient as any);

      await presenter.chat("sess-1", "test");

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        CHAT_STREAM_EVENTS.ERROR,
        expect.objectContaining({ sessionId: "sess-1", error: "LLM failed" }),
      );
      expect(presenter.getSessionState("sess-1")).toBe("error");
    });

    it("executes tool calls and loops", async () => {
      let callCount = 0;
      const mockClient = {
        chat: vi.fn(async function* () {
          callCount++;
          if (callCount === 1) {
            yield { type: "text", text: "thinking..." };
            yield { type: "tool_call_start", id: "tc-1", name: "read" };
            yield { type: "tool_call_end", id: "tc-1", input: { path: "/tmp" } };
          } else {
            yield { type: "text", text: "done" };
          }
        }),
      };
      vi.mocked(createLLMClient).mockReturnValue(mockClient as any);

      const tp = makeToolPresenter();
      presenter = new AgentChatPresenter(makeGatewayPresenter(), tp, makeContentPresenter());
      setupDefaultMocks();

      await presenter.chat("sess-1", "test");

      expect(tp.callTool).toHaveBeenCalledWith("sess-1", "read", { path: "/tmp" });
      expect(mockClient.chat).toHaveBeenCalledTimes(2);
    });

    it("respects MAX_STEPS limit", async () => {
      let callCount = 0;
      const mockClient = {
        chat: vi.fn(async function* () {
          callCount++;
          yield { type: "tool_call_start", id: `tc-${callCount}`, name: "read" };
          yield { type: "tool_call_end", id: `tc-${callCount}`, input: { path: "/" } };
        }),
      };
      vi.mocked(createLLMClient).mockReturnValue(mockClient as any);

      const tp = makeToolPresenter();
      presenter = new AgentChatPresenter(makeGatewayPresenter(), tp, makeContentPresenter());
      setupDefaultMocks();

      await presenter.chat("sess-1", "test");

      // Should cap at 128
      expect(mockClient.chat.mock.calls.length).toBe(128);
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
      expect((presenter as any).pendingQuestions.has("sess-1")).toBe(true);
    });
  });
  it("ignores concurrent chat() calls for the same session", async () => {
    let resolveStream!: () => void;
    let callCount = 0;
    const mockClient = {
      chat: vi.fn(async function* () {
        callCount++;
        if (callCount === 1) {
          yield { type: "text", text: "thinking..." };
          await new Promise<void>((r) => {
            resolveStream = r;
          });
        } else {
          yield { type: "text", text: "second" };
        }
      }),
    };
    vi.mocked(createLLMClient).mockReturnValue(mockClient as any);

    const first = presenter.chat("sess-1", "first");
    await new Promise((r) => setTimeout(r, 5));
    expect(presenter.getSessionState("sess-1")).toBe("generating");

    await presenter.chat("sess-1", "second");
    expect(callCount).toBe(1);

    resolveStream();
    await first;
  }, 8000);
});
