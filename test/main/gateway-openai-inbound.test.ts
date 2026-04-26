import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDb, closeDb } from "@/db";
import { createApiKey } from "@/db/models/apiKeyDao";
import { createServer } from "@/gateway/server";
import type { Relay, RelayResult, RelayStreamResult } from "@/gateway/relay";
import type { Router } from "@/gateway/router";
import type { InternalResponse, StreamEvent } from "@/gateway/outbound/types";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

const baseResponse: InternalResponse = {
  content: [{ type: "text", text: "hello" }],
  usage: { inputTokens: 10, outputTokens: 5 },
  model: "gpt-4o",
  stopReason: "stop",
};

const toolResponse: InternalResponse = {
  content: [
    { type: "text", text: "Let me call the tool." },
    { type: "tool_use", id: "call_abc", name: "get_weather", input: { city: "Tokyo" } },
  ],
  usage: { inputTokens: 20, outputTokens: 15 },
  model: "gpt-4o",
  stopReason: "tool_calls",
};

function mockRelay(overrides?: Partial<Relay>): Relay {
  return {
    relay: vi.fn().mockResolvedValue({
      response: baseResponse,
      channelId: 1,
      channelName: "ch1",
      keyId: 1,
      modelName: "gpt-4o",
      durationMs: 100,
    } satisfies RelayResult),
    relayStream: vi.fn(),
    onStats: vi.fn(),
    ...overrides,
  };
}

function mockRouter(): Router {
  return {
    reload: vi.fn(),
    resolve: vi.fn(),
    listGroupNames: vi.fn().mockReturnValue(["gpt-4o"]),
    getGroupsWithSlot: vi.fn().mockReturnValue([]),
  };
}

function createTestKey(overrides?: Record<string, unknown>) {
  return createApiKey(db, {
    name: "test",
    key: "sk-test-123",
    enabled: true,
    isInternal: false,
    ...overrides,
  });
}

const AUTH = { authorization: "Bearer sk-test-123", "content-type": "application/json" };

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("POST /v1/responses", () => {
  it("非流式：字符串输入", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: { model: "gpt-4o", input: "hello" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("response");
    expect(body.status).toBe("completed");
    expect(body.model).toBe("gpt-4o");
    expect(body.output).toHaveLength(1);
    expect(body.output[0].type).toBe("message");
    expect(body.output[0].content[0]).toEqual({ type: "output_text", text: "hello" });
    expect(body.usage.input_tokens).toBe(10);
    expect(body.usage.output_tokens).toBe(5);
    expect(body.usage.total_tokens).toBe(15);

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("非流式：消息数组输入", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: {
        model: "gpt-4o",
        input: [
          { type: "message", role: "user", content: "hi" },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hey" }],
          },
          { type: "message", role: "user", content: "how are you" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.messages).toHaveLength(3);
    expect(relayCall.messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    expect(relayCall.messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "hey" }],
    });
    expect(relayCall.messages[2]).toEqual({
      role: "user",
      content: [{ type: "text", text: "how are you" }],
    });
  });

  it("非流式：工具转换", async () => {
    createTestKey();
    const relay = mockRelay({
      relay: vi.fn().mockResolvedValue({
        response: toolResponse,
        channelId: 1,
        channelName: "ch1",
        keyId: 1,
        modelName: "gpt-4o",
        durationMs: 100,
      } satisfies RelayResult),
    });
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: {
        model: "gpt-4o",
        input: "weather?",
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // text message first, then function_call
    expect(body.output).toHaveLength(2);
    expect(body.output[0].type).toBe("message");
    expect(body.output[0].content[0].text).toBe("Let me call the tool.");
    expect(body.output[1].type).toBe("function_call");
    expect(body.output[1].call_id).toBe("call_abc");
    expect(body.output[1].name).toBe("get_weather");
    expect(body.output[1].arguments).toBe('{"city":"Tokyo"}');

    // verify tools converted to InternalTool
    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.tools).toEqual([
      {
        name: "get_weather",
        description: "Get weather",
        inputSchema: { type: "object", properties: { city: { type: "string" } } },
      },
    ]);
  });

  it("非流式：function_call_output 输入", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: {
        model: "gpt-4o",
        input: [
          { type: "message", role: "user", content: "weather?" },
          { type: "function_call_output", call_id: "call_abc", output: '{"temp":22}' },
        ],
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.messages).toHaveLength(2);
    expect(relayCall.messages[1]).toEqual({
      role: "tool",
      content: [{ type: "tool_result", toolUseId: "call_abc", content: '{"temp":22}' }],
    });
  });

  it("非流式：instructions → systemPrompt", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: {
        model: "gpt-4o",
        input: "hi",
        instructions: "You are helpful.",
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.systemPrompt).toBe("You are helpful.");
  });

  it("非流式：max_output_tokens → maxTokens", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: { model: "gpt-4o", input: "hi", max_output_tokens: 4096 },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.maxTokens).toBe(4096);
  });

  it("模型白名单拦截", async () => {
    createTestKey({ allowedModels: ["claude-3"] });
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: { model: "gpt-4o", input: "hi" },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("forbidden");
  });

  it("流式响应返回 SSE", async () => {
    createTestKey();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "Hi" } },
      { type: "content_delta", delta: { type: "text", text: " there" } },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 3 } },
      { type: "stop", stopReason: "stop", model: "gpt-4o" },
    ];

    async function* fakeStream(): AsyncIterable<StreamEvent> {
      for (const e of events) yield e;
    }

    const relay = mockRelay({
      relayStream: vi.fn().mockResolvedValue({
        stream: fakeStream(),
        channelId: 1,
        channelName: "ch1",
        keyId: 1,
        modelName: "gpt-4o",
        startTime: Date.now(),
      } satisfies RelayStreamResult),
    });

    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/responses",
      headers: AUTH,
      payload: { model: "gpt-4o", input: "hi", stream: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");

    const body = res.body;
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: response.output_item.added");
    expect(body).toContain("event: response.content_part.added");
    expect(body).toContain("event: response.output_text.delta");
    expect(body).toContain('"Hi"');
    expect(body).toContain('" there"');
    expect(body).toContain("event: response.output_text.done");
    expect(body).toContain('"Hi there"');
    expect(body).toContain("event: response.completed");
  });
});
