import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/db/models/agentSessionDao");
vi.mock("@/db/models/agentSessionConfigDao");
vi.mock("@/db/models/agentMessageDao");

vi.mock("@/utils", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import { SubagentPresenter } from "@/presenter/agentChat/subagentPresenter";

function makeChatPresenter() {
  return {
    chat: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
  } as any;
}

function makeParentSession(overrides?: Partial<Record<string, any>>) {
  return {
    id: "parent-1",
    agentId: "agent-1",
    title: "Parent",
    isPinned: false,
    sessionKind: "regular",
    parentSessionId: null,
    subagentMeta: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("SubagentPresenter", () => {
  let chatPresenter: ReturnType<typeof makeChatPresenter>;
  let subagent: SubagentPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    chatPresenter = makeChatPresenter();
    subagent = new SubagentPresenter(chatPresenter);

    vi.mocked(sessionDao.getSessionById).mockReturnValue(makeParentSession());
    vi.mocked(configDao.getConfigById).mockReturnValue({
      id: "parent-1",
      capabilityRequirements: ["chat"],
      systemPrompt: "You are helpful.",
      temperature: null,
      contextLength: null,
      maxTokens: null,
      thinkingBudget: null,
      summaryText: null,
      summaryCursorSeq: 0,
    });
    vi.mocked(configDao.createConfig).mockImplementation((_db, data) => ({
      id: data.id,
      capabilityRequirements: data.capabilityRequirements ?? ["chat"],
      systemPrompt: data.systemPrompt ?? null,
      temperature: data.temperature ?? null,
      contextLength: data.contextLength ?? null,
      maxTokens: data.maxTokens ?? null,
      thinkingBudget: data.thinkingBudget ?? null,
      summaryText: null,
      summaryCursorSeq: 0,
    }));
    vi.mocked(sessionDao.createSession).mockImplementation((_db, data) => ({
      id: data.id,
      agentId: data.agentId,
      title: data.title,
      isPinned: false,
      sessionKind: data.sessionKind ?? "regular",
      parentSessionId: data.parentSessionId ?? null,
      subagentMeta: data.subagentMeta ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    vi.mocked(messageDao.listBySession).mockReturnValue([]);
  });

  describe("fork-inherit", () => {
    it("creates child session with sessionKind=subagent and parentSessionId", async () => {
      await subagent.fork("parent-1", "inherit", "do something");

      expect(sessionDao.createSession).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sessionDao.createSession).mock.calls[0][1];
      expect(call.sessionKind).toBe("subagent");
      expect(call.parentSessionId).toBe("parent-1");
      expect(call.subagentMeta).toEqual({
        mode: "inherit",
        prompt: "do something",
        parentSessionId: "parent-1",
      });
    });

    it("copies parent config to child and injects summaryText", async () => {
      vi.mocked(configDao.getConfigById).mockReturnValue({
        id: "parent-1",
        capabilityRequirements: ["reasoning"],
        systemPrompt: "Be smart.",
        temperature: 0.5,
        contextLength: null,
        maxTokens: 4096,
        thinkingBudget: null,
        summaryText: "Parent context summary",
        summaryCursorSeq: 3,
      });

      await subagent.fork("parent-1", "inherit", "task");

      expect(configDao.createConfig).toHaveBeenCalledTimes(1);
      const configCall = vi.mocked(configDao.createConfig).mock.calls[0][1];
      expect(configCall.capabilityRequirements).toEqual(["reasoning"]);
      expect(configCall.systemPrompt).toBe("Be smart.");
      expect(configCall.maxTokens).toBe(4096);

      expect(configDao.updateConfig).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
        summaryText: "Parent context summary",
      });
    });

    it("does not inject summaryText when parent has none", async () => {
      await subagent.fork("parent-1", "inherit", "task");
      expect(configDao.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe("fork-new", () => {
    it("creates child session without inheriting summaryText", async () => {
      vi.mocked(configDao.getConfigById).mockReturnValue({
        id: "parent-1",
        capabilityRequirements: ["chat"],
        systemPrompt: null,
        temperature: null,
        contextLength: null,
        maxTokens: null,
        thinkingBudget: null,
        summaryText: "Some summary",
        summaryCursorSeq: 0,
      });

      await subagent.fork("parent-1", "new", "fresh task");

      expect(sessionDao.createSession).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sessionDao.createSession).mock.calls[0][1];
      expect(call.sessionKind).toBe("subagent");
      expect(call.subagentMeta?.mode).toBe("new");

      // new mode should not call updateConfig for summaryText
      expect(configDao.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe("recursive fork rejection", () => {
    it("throws when parent is already a subagent", async () => {
      vi.mocked(sessionDao.getSessionById).mockReturnValue(
        makeParentSession({ sessionKind: "subagent" }),
      );

      await expect(subagent.fork("parent-1", "inherit", "nested")).rejects.toThrow(
        "Recursive subagent fork is not allowed",
      );
      expect(sessionDao.createSession).not.toHaveBeenCalled();
    });
  });

  describe("parent not found", () => {
    it("throws when parent session does not exist", async () => {
      vi.mocked(sessionDao.getSessionById).mockReturnValue(undefined);
      await expect(subagent.fork("missing", "new", "task")).rejects.toThrow(
        "Parent session not found",
      );
    });
  });

  describe("timeout protection", () => {
    it("returns error and stops generation on timeout", async () => {
      vi.useFakeTimers();
      chatPresenter.chat.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const forkPromise = subagent.fork("parent-1", "new", "slow task");
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
      const result = await forkPromise;

      expect(result).toContain("[Subagent error:");
      expect(result).toContain("timeout");
      expect(chatPresenter.stopGeneration).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("result extraction", () => {
    it("extracts text from assistant message blocks", async () => {
      const blocks = JSON.stringify([
        { type: "content", content: "Hello " },
        { type: "tool_call", content: "" },
        { type: "content", content: "world" },
      ]);
      vi.mocked(messageDao.listBySession).mockReturnValue([
        {
          id: "msg-1",
          sessionId: "child-1",
          orderSeq: 1,
          role: "user",
          content: "task",
          status: "sent",
          isContextEdge: false,
          metadata: "{}",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "msg-2",
          sessionId: "child-1",
          orderSeq: 2,
          role: "assistant",
          content: blocks,
          status: "sent",
          isContextEdge: false,
          metadata: "{}",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const result = await subagent.fork("parent-1", "new", "task");
      expect(result).toBe("Hello world");
    });

    it("falls back to raw content when blocks parse fails", async () => {
      vi.mocked(messageDao.listBySession).mockReturnValue([
        {
          id: "msg-1",
          sessionId: "child-1",
          orderSeq: 1,
          role: "assistant",
          content: "plain text response",
          status: "sent",
          isContextEdge: false,
          metadata: "{}",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const result = await subagent.fork("parent-1", "new", "task");
      expect(result).toBe("plain text response");
    });

    it("returns no-response message when no assistant message", async () => {
      vi.mocked(messageDao.listBySession).mockReturnValue([]);
      const result = await subagent.fork("parent-1", "new", "task");
      expect(result).toBe("[Subagent completed with no response]");
    });

    it("falls back to raw content when all blocks have empty content", async () => {
      const blocks = JSON.stringify([{ type: "tool_call", content: "" }]);
      vi.mocked(messageDao.listBySession).mockReturnValue([
        {
          id: "msg-1",
          sessionId: "child-1",
          orderSeq: 1,
          role: "assistant",
          content: blocks,
          status: "sent",
          isContextEdge: false,
          metadata: "{}",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const result = await subagent.fork("parent-1", "new", "task");
      // No content blocks → textParts.join("") is "" → falls back to raw content
      expect(result).toBe(blocks);
    });
  });
});
