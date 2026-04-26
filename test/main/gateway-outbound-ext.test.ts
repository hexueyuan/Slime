import { describe, it, expect, beforeEach } from "vitest";
import { toGeminiRequest, fromGeminiResponse } from "@/gateway/outbound/gemini";
import { getAdapter, initAdapters } from "@/gateway/outbound/registry";
import type { InternalRequest } from "@/gateway/outbound/types";

function baseRequest(overrides?: Partial<InternalRequest>): InternalRequest {
  return {
    model: "test-model",
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    stream: false,
    ...overrides,
  };
}

describe("gemini outbound", () => {
  describe("toGeminiRequest", () => {
    it("basic message conversion", () => {
      const body = toGeminiRequest(baseRequest());
      expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
    });

    it("extracts systemPrompt to systemInstruction", () => {
      const body = toGeminiRequest(baseRequest({ systemPrompt: "be helpful" }));
      expect(body.systemInstruction).toEqual({ parts: [{ text: "be helpful" }] });
    });

    it("extracts system role messages to systemInstruction", () => {
      const body = toGeminiRequest(
        baseRequest({
          messages: [
            { role: "system", content: [{ type: "text", text: "sys msg" }] },
            { role: "user", content: [{ type: "text", text: "hi" }] },
          ],
        }),
      );
      expect(body.systemInstruction).toEqual({ parts: [{ text: "sys msg" }] });
      // system messages should not appear in contents
      expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
    });

    it("maps assistant role to model", () => {
      const body = toGeminiRequest(
        baseRequest({
          messages: [
            { role: "user", content: [{ type: "text", text: "hi" }] },
            { role: "assistant", content: [{ type: "text", text: "hey" }] },
          ],
        }),
      );
      const contents = body.contents as Array<Record<string, unknown>>;
      expect(contents[1].role).toBe("model");
    });

    it("converts tool_use to functionCall", () => {
      const body = toGeminiRequest(
        baseRequest({
          messages: [
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "tc1", name: "read", input: { path: "/a" } }],
            },
          ],
        }),
      );
      const contents = body.contents as Array<{ parts: Array<Record<string, unknown>> }>;
      expect(contents[0].parts[0]).toEqual({
        functionCall: { name: "read", args: { path: "/a" } },
      });
    });

    it("converts tool_result to functionResponse", () => {
      const body = toGeminiRequest(
        baseRequest({
          messages: [
            {
              role: "tool",
              content: [{ type: "tool_result", toolUseId: "read", content: "file content" }],
            },
          ],
        }),
      );
      const contents = body.contents as Array<{ parts: Array<Record<string, unknown>> }>;
      expect(contents[0].parts[0]).toEqual({
        functionResponse: { name: "read", response: { result: "file content" } },
      });
    });

    it("converts tools to functionDeclarations", () => {
      const body = toGeminiRequest(
        baseRequest({
          tools: [{ name: "read", description: "read file", inputSchema: { type: "object" } }],
        }),
      );
      expect(body.tools).toEqual([
        {
          functionDeclarations: [
            { name: "read", description: "read file", parameters: { type: "object" } },
          ],
        },
      ]);
    });

    it("sets generationConfig", () => {
      const body = toGeminiRequest(baseRequest({ maxTokens: 1024, temperature: 0.5 }));
      expect(body.generationConfig).toEqual({ maxOutputTokens: 1024, temperature: 0.5 });
    });
  });

  describe("fromGeminiResponse", () => {
    it("parses text response", () => {
      const resp = fromGeminiResponse({
        candidates: [
          {
            content: { parts: [{ text: "hello" }], role: "model" },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });
      expect(resp.content).toEqual([{ type: "text", text: "hello" }]);
      expect(resp.stopReason).toBe("STOP");
      expect(resp.usage.inputTokens).toBe(10);
      expect(resp.usage.outputTokens).toBe(5);
    });

    it("parses functionCall response", () => {
      const resp = fromGeminiResponse({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "read", args: { path: "/a" } } }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      });
      expect(resp.content[0]).toEqual({
        type: "tool_use",
        id: "gemini-read",
        name: "read",
        input: { path: "/a" },
      });
    });

    it("parses cache tokens", () => {
      const resp = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: "hi" }], role: "model" }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 80,
        },
      });
      expect(resp.usage.cacheReadTokens).toBe(80);
    });
  });
});

describe("adapter registry", () => {
  beforeEach(() => {
    initAdapters();
  });

  it("initAdapters registers all channel types", () => {
    const types = ["anthropic", "openai", "gemini", "deepseek", "volcengine", "custom"] as const;
    for (const t of types) {
      const adapter = getAdapter(t);
      expect(adapter).toBeDefined();
      expect(adapter.send).toBeTypeOf("function");
      expect(adapter.sendStream).toBeTypeOf("function");
    }
  });

  it("getAdapter returns correct adapter", () => {
    const a1 = getAdapter("openai");
    const a2 = getAdapter("openai");
    expect(a1).toBe(a2);
  });

  it("getAdapter throws for unknown type", () => {
    expect(() => getAdapter("unknown" as never)).toThrow("No adapter for channel type: unknown");
  });
});
