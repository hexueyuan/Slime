import { describe, it, expect } from "vitest";
import {
  estimateMessagesTokens,
  microCompact,
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
    const toolMsg = result.find((m) => m.role === "tool") as any;
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
  });
});
