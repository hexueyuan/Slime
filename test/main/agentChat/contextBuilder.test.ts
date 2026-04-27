import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  estimateTokens,
  recordToCoreMessages,
  selectTurnHistory,
  buildContext,
} from "@/presenter/agentChat/contextBuilder";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/agent";

vi.mock("@/db/models/agentMessageDao");
vi.mock("@/db/models/agentSessionConfigDao");

import * as messageDao from "@/db/models/agentMessageDao";
import * as configDao from "@/db/models/agentSessionConfigDao";

function makeRecord(
  overrides: Partial<ChatMessageRecord> & { role: ChatMessageRecord["role"]; content: string },
): ChatMessageRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? "sess-1",
    orderSeq: overrides.orderSeq ?? 1,
    role: overrides.role,
    content: overrides.content,
    status: overrides.status ?? "sent",
    isContextEdge: overrides.isContextEdge ?? false,
    metadata: overrides.metadata ?? "{}",
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

function makeAssistantContent(blocks: AssistantMessageBlock[]): string {
  return JSON.stringify(blocks);
}

describe("estimateTokens", () => {
  it("returns ceil(length / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("hello world")).toBe(3); // 11 / 4 = 2.75 → 3
  });
});

describe("recordToCoreMessages", () => {
  it("converts user messages", () => {
    const records = [makeRecord({ role: "user", content: "hello" })];
    const result = recordToCoreMessages(records);
    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts assistant plain text", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "Hi there", status: "success", timestamp: 1 },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);
    expect(result).toEqual([{ role: "assistant", content: "Hi there" }]);
  });

  it("converts assistant with tool_call", () => {
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "Let me check.", status: "success", timestamp: 1 },
      {
        type: "tool_call",
        status: "success",
        timestamp: 2,
        tool_call: {
          id: "tc-1",
          name: "read_file",
          input: { path: "/tmp/a.txt" },
          output: "file content here",
        },
      },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toContain("Let me check.");
    expect(result[0].content).toContain("[Tool call: read_file(");
    expect(result[1]).toEqual({
      role: "tool",
      content: "file content here",
      toolCallId: "tc-1",
    });
  });

  it("handles unparseable assistant content as plain text", () => {
    const records = [makeRecord({ role: "assistant", content: "just plain text" })];
    const result = recordToCoreMessages(records);
    expect(result).toEqual([{ role: "assistant", content: "just plain text" }]);
  });
});

describe("selectTurnHistory", () => {
  it("returns all messages when within budget", () => {
    const msgs = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    const result = selectTurnHistory(msgs, 10000);
    expect(result).toEqual(msgs);
  });

  it("trims old messages when over budget", () => {
    const msgs = [
      { role: "user" as const, content: "a".repeat(400) }, // 100 tokens
      { role: "assistant" as const, content: "b".repeat(400) }, // 100 tokens
      { role: "user" as const, content: "c".repeat(40) }, // 10 tokens
      { role: "assistant" as const, content: "d".repeat(40) }, // 10 tokens
    ];
    // budget = 25 tokens, only last pair fits
    const result = selectTurnHistory(msgs, 25);
    expect(result).toEqual([
      { role: "user", content: "c".repeat(40) },
      { role: "assistant", content: "d".repeat(40) },
    ]);
  });

  it("returns empty for zero budget", () => {
    const msgs = [{ role: "user" as const, content: "hi" }];
    const result = selectTurnHistory(msgs, 0);
    expect(result).toEqual([]);
  });

  it("does not start with assistant message", () => {
    const msgs = [
      { role: "assistant" as const, content: "a".repeat(4) }, // 1 token
      { role: "user" as const, content: "b".repeat(4) }, // 1 token
      { role: "assistant" as const, content: "c".repeat(4) }, // 1 token
    ];
    // budget = 3 tokens, all fit, but first is assistant → skip to user
    const result = selectTurnHistory(msgs, 3);
    expect(result[0].role).not.toBe("assistant");
  });
});

describe("buildContext", () => {
  const fakeDb = {} as any;

  beforeEach(() => {
    vi.mocked(messageDao.listBySession).mockReturnValue([]);
    vi.mocked(configDao.getConfigById).mockReturnValue(undefined);
  });

  it("builds context for new session (no history)", () => {
    const result = buildContext("sess-1", "Hello!", fakeDb);
    expect(result[0]).toEqual({ role: "system", content: "You are a helpful AI assistant." });
    expect(result[result.length - 1]).toEqual({ role: "user", content: "Hello!" });
    expect(result).toHaveLength(2);
  });

  it("includes system prompt from config", () => {
    vi.mocked(configDao.getConfigById).mockReturnValue({
      id: "sess-1",
      capabilityRequirements: ["chat"],
      systemPrompt: "You are a cat.",
      contextLength: 128000,
      summaryCursorSeq: 0,
    });
    const result = buildContext("sess-1", "meow", fakeDb);
    expect(result[0]).toEqual({ role: "system", content: "You are a cat." });
  });

  it("includes history and summary", () => {
    vi.mocked(configDao.getConfigById).mockReturnValue({
      id: "sess-1",
      capabilityRequirements: ["chat"],
      systemPrompt: "Assistant",
      contextLength: 128000,
      summaryText: "User asked about weather.",
      summaryCursorSeq: 2,
    });
    vi.mocked(messageDao.listBySession).mockReturnValue([
      makeRecord({ orderSeq: 1, role: "user", content: "old msg", status: "sent" }),
      makeRecord({ orderSeq: 2, role: "assistant", content: "old reply", status: "sent" }),
      makeRecord({ orderSeq: 3, role: "user", content: "new msg", status: "sent" }),
      makeRecord({
        orderSeq: 4,
        role: "assistant",
        content: makeAssistantContent([
          { type: "content", content: "new reply", status: "success", timestamp: 1 },
        ]),
        status: "sent",
      }),
    ]);

    const result = buildContext("sess-1", "latest", fakeDb);

    // system + summary + history(orderSeq > 2: msg3 + msg4) + new user
    expect(result[0]).toEqual({ role: "system", content: "Assistant" });
    expect(result[1].role).toBe("system");
    expect(result[1].content).toContain("Previous conversation summary");
    expect(result[1].content).toContain("weather");
    // history: user "new msg" + assistant "new reply"
    expect(result[2]).toEqual({ role: "user", content: "new msg" });
    expect(result[3]).toEqual({ role: "assistant", content: "new reply" });
    expect(result[result.length - 1]).toEqual({ role: "user", content: "latest" });
  });

  it("trims history when context is tight", () => {
    vi.mocked(configDao.getConfigById).mockReturnValue({
      id: "sess-1",
      capabilityRequirements: ["chat"],
      systemPrompt: "Hi",
      contextLength: 200, // very small
      summaryCursorSeq: 0,
    });
    vi.mocked(messageDao.listBySession).mockReturnValue([
      makeRecord({
        orderSeq: 1,
        role: "user",
        content: "a".repeat(400),
        status: "sent",
      }),
      makeRecord({
        orderSeq: 2,
        role: "assistant",
        content: makeAssistantContent([
          { type: "content", content: "b".repeat(400), status: "success", timestamp: 1 },
        ]),
        status: "sent",
      }),
      makeRecord({ orderSeq: 3, role: "user", content: "short", status: "sent" }),
      makeRecord({
        orderSeq: 4,
        role: "assistant",
        content: makeAssistantContent([
          { type: "content", content: "ok", status: "success", timestamp: 1 },
        ]),
        status: "sent",
      }),
    ]);

    const result = buildContext("sess-1", "q", fakeDb);
    // old large messages should be trimmed, only recent small ones kept
    const historyMsgs = result.filter(
      (m) => m.role !== "system" && m !== result[result.length - 1],
    );
    // The first pair (400 chars each = 100 tokens each) should be trimmed
    for (const m of historyMsgs) {
      expect(m.content.length).toBeLessThan(400);
    }
  });
});
