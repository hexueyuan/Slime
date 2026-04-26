import { describe, it, expect } from "vitest";
import { toAnthropicRequest, fromAnthropicResponse } from "@/gateway/outbound/anthropic";
import { toOpenAIRequest, fromOpenAIResponse } from "@/gateway/outbound/openai-chat";
import type { InternalRequest } from "@/gateway/outbound/types";

function baseRequest(overrides?: Partial<InternalRequest>): InternalRequest {
  return {
    model: "test-model",
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    stream: false,
    ...overrides,
  };
}

describe("anthropic outbound", () => {
  describe("toAnthropicRequest", () => {
    it("basic message conversion", () => {
      const body = toAnthropicRequest(baseRequest({ maxTokens: 1024 }));
      expect(body).toEqual({
        model: "test-model",
        messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        max_tokens: 1024,
      });
    });

    it("extracts systemPrompt to top-level system", () => {
      const body = toAnthropicRequest(baseRequest({ systemPrompt: "be helpful" }));
      expect(body.system).toBe("be helpful");
    });

    it("extracts system role messages when no systemPrompt", () => {
      const body = toAnthropicRequest(
        baseRequest({
          messages: [
            { role: "system", content: [{ type: "text", text: "sys msg" }] },
            { role: "user", content: [{ type: "text", text: "hi" }] },
          ],
        }),
      );
      expect(body.system).toBe("sys msg");
      expect((body.messages as unknown[]).length).toBe(1);
    });

    it("converts tool_use content", () => {
      const body = toAnthropicRequest(
        baseRequest({
          messages: [
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "tc1", name: "read", input: { path: "/a" } }],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<{ content: Array<Record<string, unknown>> }>;
      expect(msgs[0].content[0]).toEqual({
        type: "tool_use",
        id: "tc1",
        name: "read",
        input: { path: "/a" },
      });
    });

    it("converts tool_result content", () => {
      const body = toAnthropicRequest(
        baseRequest({
          messages: [
            {
              role: "tool",
              content: [{ type: "tool_result", toolUseId: "tc1", content: "file content" }],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<{ content: Array<Record<string, unknown>> }>;
      expect(msgs[0].content[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "tc1",
        content: "file content",
      });
    });

    it("converts tools", () => {
      const body = toAnthropicRequest(
        baseRequest({
          tools: [{ name: "read", description: "read file", inputSchema: { type: "object" } }],
        }),
      );
      expect((body.tools as unknown[]).length).toBe(1);
      expect((body.tools as Array<Record<string, unknown>>)[0]).toEqual({
        name: "read",
        description: "read file",
        input_schema: { type: "object" },
      });
    });

    it("sets stream flag", () => {
      const body = toAnthropicRequest(baseRequest({ stream: true }));
      expect(body.stream).toBe(true);
    });

    it("defaults max_tokens to 4096", () => {
      const body = toAnthropicRequest(baseRequest());
      expect(body.max_tokens).toBe(4096);
    });
  });

  describe("fromAnthropicResponse", () => {
    it("parses text response", () => {
      const resp = fromAnthropicResponse({
        content: [{ type: "text", text: "hello" }],
        model: "claude-3",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      expect(resp.content).toEqual([{ type: "text", text: "hello" }]);
      expect(resp.model).toBe("claude-3");
      expect(resp.stopReason).toBe("end_turn");
      expect(resp.usage.inputTokens).toBe(10);
      expect(resp.usage.outputTokens).toBe(5);
    });

    it("parses tool_use response", () => {
      const resp = fromAnthropicResponse({
        content: [{ type: "tool_use", id: "tc1", name: "read", input: { path: "/a" } }],
        model: "claude-3",
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 20 },
      });
      expect(resp.content[0]).toEqual({
        type: "tool_use",
        id: "tc1",
        name: "read",
        input: { path: "/a" },
      });
    });

    it("parses cache tokens", () => {
      const resp = fromAnthropicResponse({
        content: [{ type: "text", text: "hi" }],
        model: "claude-3",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
        },
      });
      expect(resp.usage.cacheReadTokens).toBe(80);
      expect(resp.usage.cacheWriteTokens).toBe(20);
    });
  });
});

describe("openai outbound", () => {
  describe("toOpenAIRequest", () => {
    it("basic message conversion", () => {
      const body = toOpenAIRequest(baseRequest());
      expect(body.model).toBe("test-model");
      expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    });

    it("prepends systemPrompt as system message", () => {
      const body = toOpenAIRequest(baseRequest({ systemPrompt: "be helpful" }));
      const msgs = body.messages as Array<Record<string, unknown>>;
      expect(msgs[0]).toEqual({ role: "system", content: "be helpful" });
      expect(msgs[1]).toEqual({ role: "user", content: "hello" });
    });

    it("converts tool_use to tool_calls", () => {
      const body = toOpenAIRequest(
        baseRequest({
          messages: [
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "tc1", name: "read", input: { path: "/a" } }],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<Record<string, unknown>>;
      expect(msgs[0].tool_calls).toEqual([
        {
          id: "tc1",
          type: "function",
          function: { name: "read", arguments: '{"path":"/a"}' },
        },
      ]);
    });

    it("converts tool_result to tool role", () => {
      const body = toOpenAIRequest(
        baseRequest({
          messages: [
            {
              role: "tool",
              content: [{ type: "tool_result", toolUseId: "tc1", content: "result text" }],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<Record<string, unknown>>;
      expect(msgs[0]).toEqual({ role: "tool", tool_call_id: "tc1", content: "result text" });
    });

    it("converts tools", () => {
      const body = toOpenAIRequest(
        baseRequest({
          tools: [{ name: "read", description: "read file", inputSchema: { type: "object" } }],
        }),
      );
      expect((body.tools as unknown[]).length).toBe(1);
      expect((body.tools as Array<Record<string, unknown>>)[0]).toEqual({
        type: "function",
        function: {
          name: "read",
          description: "read file",
          parameters: { type: "object" },
        },
      });
    });

    it("includes stream_options when streaming", () => {
      const body = toOpenAIRequest(baseRequest({ stream: true }));
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    it("converts image content to image_url", () => {
      const body = toOpenAIRequest(
        baseRequest({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "describe" },
                {
                  type: "image",
                  source: { type: "url", url: "https://img.com/a.png" },
                },
              ],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<Record<string, unknown>>;
      expect(msgs[0].content).toEqual([
        { type: "text", text: "describe" },
        { type: "image_url", image_url: { url: "https://img.com/a.png" } },
      ]);
    });

    it("converts base64 image to data uri", () => {
      const body = toOpenAIRequest(
        baseRequest({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", mediaType: "image/png", data: "abc123" },
                },
              ],
            },
          ],
        }),
      );
      const msgs = body.messages as Array<Record<string, unknown>>;
      const content = msgs[0].content as Array<Record<string, unknown>>;
      expect((content[0] as { image_url: { url: string } }).image_url.url).toBe(
        "data:image/png;base64,abc123",
      );
    });
  });

  describe("fromOpenAIResponse", () => {
    it("parses text response", () => {
      const resp = fromOpenAIResponse({
        choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
        model: "gpt-4o",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      expect(resp.content).toEqual([{ type: "text", text: "hi" }]);
      expect(resp.model).toBe("gpt-4o");
      expect(resp.stopReason).toBe("stop");
      expect(resp.usage.inputTokens).toBe(10);
      expect(resp.usage.outputTokens).toBe(5);
    });

    it("parses tool_calls response", () => {
      const resp = fromOpenAIResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "tc1",
                  type: "function",
                  function: { name: "read", arguments: '{"path":"/a"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        model: "gpt-4o",
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });
      expect(resp.content).toEqual([
        { type: "tool_use", id: "tc1", name: "read", input: { path: "/a" } },
      ]);
      expect(resp.stopReason).toBe("tool_calls");
    });

    it("parses mixed text + tool_calls", () => {
      const resp = fromOpenAIResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: "thinking...",
              tool_calls: [
                {
                  id: "tc1",
                  type: "function",
                  function: { name: "exec", arguments: '{"cmd":"ls"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        model: "gpt-4o",
        usage: { prompt_tokens: 15, completion_tokens: 25 },
      });
      expect(resp.content).toHaveLength(2);
      expect(resp.content[0]).toEqual({ type: "text", text: "thinking..." });
      expect(resp.content[1]).toEqual({
        type: "tool_use",
        id: "tc1",
        name: "exec",
        input: { cmd: "ls" },
      });
    });
  });
});
