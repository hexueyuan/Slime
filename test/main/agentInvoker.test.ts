import { describe, it, expect } from "vitest";
import { estimateMessagesTokens } from "../../src/main/presenter/agentChat/agentInvoker";
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
