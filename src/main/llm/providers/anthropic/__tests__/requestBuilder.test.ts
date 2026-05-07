import { describe, it, expect } from "vitest";
import { buildAnthropicRequest } from "../requestBuilder";
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";
import type { Tool, ChatOptions } from "@/llm/core/types";

describe("buildAnthropicRequest", () => {
  const baseOptions: ChatOptions = { model: "claude-3-5-sonnet-20241022", maxTokens: 1024 };

  it("基本请求：user 消息转换", () => {
    const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    expect(result.model).toBe("claude-3-5-sonnet-20241022");
    expect(result.max_tokens).toBe(1024);
    expect(result.stream).toBe(true);
    expect(result.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(result.system).toBeUndefined();
    expect(result.tools).toBeUndefined();
  });

  it("system 消息提取到独立字段（字符串格式）", () => {
    const messages: CoreMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hi" },
    ];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    expect(result.system).toBe("You are helpful.");
    expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("system 消息提取到独立字段（数组格式，含 cache_control）", () => {
    const messages: CoreMessage[] = [
      {
        role: "system",
        content: [
          { type: "text", text: "identity block", cache_control: { type: "ephemeral" } },
          { type: "text", text: "constraints block", cache_control: { type: "ephemeral" } },
        ],
      },
      { role: "user", content: "hi" },
    ];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    expect(Array.isArray(result.system)).toBe(true);
    expect((result.system as any[])[0].text).toBe("identity block");
    expect((result.system as any[])[0].cache_control).toEqual({ type: "ephemeral" });
    expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("工具定义转换：parameters → input_schema", () => {
    const tools: Record<string, Tool> = {
      my_tool: {
        description: "does something",
        parameters: { type: "object", properties: { x: { type: "number" } } },
      },
    };
    const messages: CoreMessage[] = [{ role: "user", content: "use tool" }];
    const result = buildAnthropicRequest(messages, tools, baseOptions);
    expect(result.tools).toEqual([
      {
        name: "my_tool",
        description: "does something",
        input_schema: { type: "object", properties: { x: { type: "number" } } },
      },
    ]);
  });

  it("数组内容：tool-call 和 tool-result 转换", () => {
    const messages: CoreMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "thinking" },
          { type: "tool-call", toolCallId: "tc1", toolName: "my_tool", input: { x: 1 } },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc1",
            toolName: "my_tool",
            output: { type: "text", value: "result" },
          },
        ],
      },
    ];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    expect(result.messages[0]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "thinking" },
        { type: "tool_use", id: "tc1", name: "my_tool", input: { x: 1 } },
      ],
    });
    expect(result.messages[1]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tc1", content: "result" }],
    });
  });

  it("顶层无 cache_control 字段（per-block cache_control 在 system blocks 里）", () => {
    const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    expect((result as any).cache_control).toBeUndefined();
  });

  it("user 消息数组内容（含 cache_control blocks）透传", () => {
    const messages: CoreMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "<system-reminder>\nskills list\n</system-reminder>",
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: "actual user input" },
        ],
      },
    ];
    const result = buildAnthropicRequest(messages, {}, baseOptions);
    const userMsg = result.messages[0];
    expect(Array.isArray(userMsg.content)).toBe(true);
    const blocks = userMsg.content as any[];
    expect(blocks[0].type).toBe("text");
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].text).toBe("actual user input");
  });
});
