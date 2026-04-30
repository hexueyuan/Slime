import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  estimateTokens,
  recordToCoreMessages,
  selectTurnHistory,
  buildContext,
  buildSkillListXML,
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
    expect(Array.isArray(result[0].content)).toBe(true);
    const assistantContent = result[0].content as Array<{ type: string; [key: string]: unknown }>;
    expect(
      assistantContent.some(
        (p) => p.type === "text" && (p.text as string).includes("Let me check."),
      ),
    ).toBe(true);
    expect(assistantContent.some((p) => p.type === "tool-call" && p.toolName === "read_file")).toBe(
      true,
    );
    expect(result[1].role).toBe("tool");
    const toolContent = result[1].content as Array<{
      type: string;
      toolCallId: string;
      output: { type: string; value: string };
    }>;
    expect(Array.isArray(toolContent)).toBe(true);
    expect(toolContent[0].toolCallId).toBe("tc-1");
    expect(toolContent[0].output.value).toBe("file content here");
  });

  // AI SDK v6 格式回归测试：防止 tool 消息 content 变回字符串导致 InvalidPromptError
  it("tool message content is array not string (AI SDK v6 format)", () => {
    const blocks: AssistantMessageBlock[] = [
      {
        type: "tool_call",
        status: "success",
        timestamp: 1,
        tool_call: { id: "tc-2", name: "exec", input: { command: "date" }, output: "Mon Jan 1" },
      },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);

    const toolMsg = result.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    // content 必须是数组，AI SDK v6 要求
    expect(Array.isArray(toolMsg!.content)).toBe(true);
    // content 不能是字符串（旧 bug：传字符串会抛 InvalidPromptError）
    expect(typeof toolMsg!.content).not.toBe("string");
  });

  it("assistant tool-call part has correct SDK v6 fields", () => {
    const blocks: AssistantMessageBlock[] = [
      {
        type: "tool_call",
        status: "success",
        timestamp: 1,
        tool_call: {
          id: "tc-3",
          name: "write_file",
          input: { path: "/a", content: "x" },
          output: null,
        },
      },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);

    const assistantMsg = result.find((m) => m.role === "assistant");
    const parts = assistantMsg!.content as Array<{ type: string; [key: string]: unknown }>;
    const toolCallPart = parts.find((p) => p.type === "tool-call");
    expect(toolCallPart).toBeDefined();
    // AI SDK v6 要求 toolCallId / toolName / input 字段
    expect(toolCallPart!.toolCallId).toBe("tc-3");
    expect(toolCallPart!.toolName).toBe("write_file");
    expect(toolCallPart!.input).toEqual({ path: "/a", content: "x" });
  });

  it("tool result output is {type, value} not raw string (AI SDK v6 format)", () => {
    const blocks: AssistantMessageBlock[] = [
      {
        type: "tool_call",
        status: "success",
        timestamp: 1,
        tool_call: { id: "tc-4", name: "exec", input: {}, output: { stdout: "ok", exit_code: 0 } },
      },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);

    const toolMsg = result.find((m) => m.role === "tool");
    const parts = toolMsg!.content as Array<{ type: string; toolCallId: string; output: unknown }>;
    expect(parts[0].output).toEqual({
      type: "text",
      value: JSON.stringify({ stdout: "ok", exit_code: 0 }),
    });
  });

  it("tool_call with null output produces empty string value", () => {
    const blocks: AssistantMessageBlock[] = [
      {
        type: "tool_call",
        status: "loading",
        timestamp: 1,
        tool_call: { id: "tc-5", name: "exec", input: {}, output: null },
      },
    ];
    const records = [makeRecord({ role: "assistant", content: makeAssistantContent(blocks) })];
    const result = recordToCoreMessages(records);

    const toolMsg = result.find((m) => m.role === "tool");
    const parts = toolMsg!.content as Array<{ output: { type: string; value: string } }>;
    expect(parts[0].output.value).toBe("");
  });

  // 多轮工具调用回归：user → assistant(tool_call) → tool_result → user → assistant
  // 模拟第 3 条消息时 buildContext 必须能产出合法的 SDK v6 messages，不抛 InvalidPromptError
  it("multi-turn with tool call reconstructs valid SDK v6 message sequence", () => {
    const toolCallBlocks: AssistantMessageBlock[] = [
      { type: "content", content: "查一下时间", status: "success", timestamp: 1 },
      {
        type: "tool_call",
        status: "success",
        timestamp: 2,
        tool_call: {
          id: "tc-6",
          name: "exec",
          input: { command: "date" },
          output: "2026-04-28 15:36",
        },
      },
    ];
    const replyBlocks: AssistantMessageBlock[] = [
      { type: "content", content: "现在是 2026-04-28 15:36", status: "success", timestamp: 3 },
    ];

    const records = [
      makeRecord({ orderSeq: 1, role: "user", content: "具体时间呢" }),
      makeRecord({ orderSeq: 2, role: "assistant", content: makeAssistantContent(toolCallBlocks) }),
      makeRecord({ orderSeq: 3, role: "user", content: "OK" }),
      makeRecord({ orderSeq: 4, role: "assistant", content: makeAssistantContent(replyBlocks) }),
    ];

    const result = recordToCoreMessages(records);

    // 期望顺序: user, assistant(array), tool(array), user, assistant(string)
    expect(result[0]).toEqual({ role: "user", content: "具体时间呢" });
    expect(result[1].role).toBe("assistant");
    expect(Array.isArray(result[1].content)).toBe(true);
    expect(result[2].role).toBe("tool");
    expect(Array.isArray(result[2].content)).toBe(true);
    expect(result[3]).toEqual({ role: "user", content: "OK" });
    expect(result[4]).toEqual({ role: "assistant", content: "现在是 2026-04-28 15:36" });
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

  // BUG-A 复现：chat() 先写 user 消息到 DB，再调 buildContext。
  // listBySession 读出的历史已包含该 user 消息，buildContext 末尾又追加一次，导致同一条消息重复出现。
  it("does not duplicate newUserContent when it already appears in DB history", () => {
    const currentContent = "what is today?";
    // 模拟 chat() 已调 createMessage 写入 DB 后的状态
    vi.mocked(messageDao.listBySession).mockReturnValue([
      makeRecord({ orderSeq: 1, role: "user", content: currentContent, status: "sent" }),
    ]);

    const result = buildContext("sess-1", currentContent, fakeDb);

    const userMessages = result.filter((m) => m.role === "user" && m.content === currentContent);
    expect(userMessages).toHaveLength(1); // 只能出现一次，目前会出现两次 → 红灯
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
      const len =
        typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length;
      expect(len).toBeLessThan(400);
    }
  });
});

describe("buildSkillListXML", () => {
  it("returns null for empty skills", () => {
    expect(buildSkillListXML([])).toBeNull();
  });

  it("formats skills in XML", () => {
    const result = buildSkillListXML([
      { name: "debug", description: "Debug errors." },
      { name: "review", description: "Review code." },
    ]);
    expect(result).toContain("<system-reminder>");
    expect(result).toContain("Skill tool");
    expect(result).toContain("- debug: Debug errors.");
    expect(result).toContain("- review: Review code.");
    expect(result).toContain("</system-reminder>");
  });
});
