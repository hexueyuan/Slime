import { describe, it, expect } from "vitest";
import {
  estimateMessagesTokens,
  microCompact,
  forceTruncate,
  COMPACTABLE_TOOLS,
} from "../../src/main/presenter/agentChat/agentInvoker";
import type { CoreMessage } from "../../src/main/presenter/agentChat/contextBuilder";

describe("estimateMessagesTokens", () => {
  it("estimates tokens for string content", () => {
    const msgs: CoreMessage[] = [
      { role: "user", content: "hello" }, // 5 chars → ceil(5/4)=2
      { role: "assistant", content: "world!!" }, // 7 chars → ceil(7/4)=2
    ];
    expect(estimateMessagesTokens(msgs)).toBe(4);
  });

  it("estimates tokens for array content", () => {
    const msgs: CoreMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc1",
            toolName: "read",
            output: { type: "text", value: "abcd" }, // JSON.stringify → ~24 chars → ceil/4=6
          },
        ],
      },
    ];
    // JSON.stringify({ type: 'text', value: 'abcd' }) = '{"type":"text","value":"abcd"}' = 30 chars → ceil(30/4)=8
    expect(estimateMessagesTokens(msgs)).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe("microCompact", () => {
  function makeLoopMessages(steps: number): CoreMessage[] {
    const fixed: CoreMessage[] = [
      { role: "system", content: [{ type: "text", text: "identity" }] },
      {
        role: "user",
        content: [{ type: "text", text: "<system-reminder>rules</system-reminder>" }],
      },
      { role: "assistant", content: "好的，我已了解当前环境和设定。" },
    ];
    const loop: CoreMessage[] = [];
    for (let i = 0; i < steps; i++) {
      loop.push({
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: `tc${i}`, toolName: "web_fetch", input: {} }],
      });
      loop.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: `tc${i}`,
            toolName: "web_fetch",
            output: { type: "text", value: "A".repeat(10000) },
          },
        ],
      });
    }
    return [...fixed, ...loop];
  }

  it("clears compactable tool results older than keepRecentSteps", () => {
    const msgs = makeLoopMessages(6);
    const result = microCompact(msgs, 4);
    const toolMsgs = result.filter((m) => m.role === "tool") as Array<{
      role: "tool";
      content: Array<{ toolName: string; output: { type: string; value: string } }>;
    }>;
    // 前 2 步被压缩
    expect(toolMsgs[0].content[0].output.value).toBe(
      "[truncated: web_fetch result cleared for context]",
    );
    expect(toolMsgs[1].content[0].output.value).toBe(
      "[truncated: web_fetch result cleared for context]",
    );
    // 最近 4 步保留
    expect(toolMsgs[2].content[0].output.value).toBe("A".repeat(10000));
    expect(toolMsgs[5].content[0].output.value).toBe("A".repeat(10000));
  });

  it("does not compact non-compactable tools", () => {
    const msgs: CoreMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
      { role: "assistant", content: "好的，我已了解当前环境和设定。" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "tc0", toolName: "ask_user", input: {} }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc0",
            toolName: "ask_user",
            output: { type: "text", value: "user answered" },
          },
        ],
      },
    ];
    const result = microCompact(msgs, 4);
    const toolMsg = result.find((m) => m.role === "tool") as {
      role: "tool";
      content: Array<{ toolName: string; output: { type: string; value: string } }>;
    };
    expect(toolMsg.content[0].output.value).toBe("user answered");
  });

  it("does not touch fixed messages (first 3)", () => {
    const msgs = makeLoopMessages(2);
    const result = microCompact(msgs, 4);
    expect(result[0]).toEqual(msgs[0]);
    expect(result[1]).toEqual(msgs[1]);
    expect(result[2]).toEqual(msgs[2]);
  });

  it("does not modify messages when all steps are within keepRecentSteps", () => {
    const msgs = makeLoopMessages(3);
    const result = microCompact(msgs, 4);
    expect(result).toEqual(msgs);
  });

  it("COMPACTABLE_TOOLS contains expected tools", () => {
    expect(COMPACTABLE_TOOLS.has("web_fetch")).toBe(true);
    expect(COMPACTABLE_TOOLS.has("read")).toBe(true);
    expect(COMPACTABLE_TOOLS.has("exec")).toBe(true);
    expect(COMPACTABLE_TOOLS.has("ask_user")).toBe(false);
    expect(COMPACTABLE_TOOLS.has("browser_get_text")).toBe(true);
    expect(COMPACTABLE_TOOLS.has("browser_screenshot")).toBe(true);
    expect(COMPACTABLE_TOOLS.has("browser_evaluate")).toBe(true);
  });
});

describe("forceTruncate", () => {
  function makeLoopMsgs(steps: number): CoreMessage[] {
    const fixed: CoreMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
      { role: "assistant", content: "好的，我已了解当前环境和设定。" },
    ];
    const loop: CoreMessage[] = [];
    for (let i = 0; i < steps; i++) {
      loop.push({
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: `tc${i}`, toolName: "read", input: {} }],
      });
      loop.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: `tc${i}`,
            toolName: "read",
            output: { type: "text", value: "x".repeat(50000) },
          },
        ],
      });
    }
    return [...fixed, ...loop];
  }

  it("removes oldest loop pairs until below threshold", () => {
    const msgs = makeLoopMsgs(10);
    const result = forceTruncate(msgs, 4, 0.9, 200_000);
    expect(estimateMessagesTokens(result)).toBeLessThan(200_000 * 0.9);
  });

  it("always keeps at least keepRecentSteps pairs", () => {
    const msgs = makeLoopMsgs(6);
    // threshold=0 → 强制裁剪到极限
    const result = forceTruncate(msgs, 4, 0.0, 200_000);
    // 固定 3 条 + 至少 4 对（8 条）= 至少 11 条
    expect(result.length).toBeGreaterThanOrEqual(3 + 4 * 2);
  });

  it("does not touch fixed messages", () => {
    const msgs = makeLoopMsgs(5);
    const result = forceTruncate(msgs, 4, 0.9, 200_000);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2]).toEqual(msgs[2]);
  });

  it("returns messages unchanged when below threshold", () => {
    // 2 步，内容很小，不会超阈值
    const msgs = makeLoopMsgs(2);
    const result = forceTruncate(msgs, 4, 0.9, 200_000);
    expect(result).toEqual(msgs);
  });

  it("removes pairs in order oldest-first", () => {
    const msgs = makeLoopMsgs(6);
    const result = forceTruncate(msgs, 4, 0.0, 200_000);
    // 应该保留最后 4 对（step 2..5），即 tc2 到 tc5
    const toolMsgs = result.filter((m) => m.role === "tool") as Array<{
      content: Array<{ toolCallId: string }>;
    }>;
    expect(toolMsgs[0].content[0].toolCallId).toBe("tc2");
    expect(toolMsgs[toolMsgs.length - 1].content[0].toolCallId).toBe("tc5");
  });
});
