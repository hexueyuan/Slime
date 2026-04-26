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
  usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 },
  model: "claude-3",
  stopReason: "end_turn",
};

function mockRelay(overrides?: Partial<Relay>): Relay {
  return {
    relay: vi.fn().mockResolvedValue({
      response: baseResponse,
      channelId: 1,
      channelName: "ch1",
      keyId: 1,
      modelName: "claude-3",
      durationMs: 100,
    } satisfies RelayResult),
    relayStream: vi.fn(),
    onStats: vi.fn(),
    ...overrides,
  };
}

function mockRouter(names: string[] = ["claude-3", "gpt-4o"]): Router {
  return {
    reload: vi.fn(),
    resolve: vi.fn(),
    listGroupNames: vi.fn().mockReturnValue(names),
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

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("auth", () => {
  it("有效 key 通过", async () => {
    createTestKey();
    const relay = mockRelay();
    const router = mockRouter();
    const server = createServer({ relay, router, db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-test-123" },
    });

    expect(res.statusCode).toBe(200);
  });

  it("无 key 返回 401", async () => {
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.type).toBe("authentication_error");
  });

  it("无效 key 返回 401", async () => {
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-wrong" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("disabled key 返回 401", async () => {
    createTestKey({ enabled: false });
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-test-123" },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.message).toBe("api key disabled");
  });

  it("过期 key 返回 401", async () => {
    createTestKey({ expiresAt: "2020-01-01T00:00:00Z" });
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-test-123" },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.message).toBe("api key expired");
  });

  it("x-api-key header 也可以认证", async () => {
    createTestKey();
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "x-api-key": "sk-test-123" },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("POST /v1/messages", () => {
  it("非流式正确转发+返回", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1024,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(body.content).toEqual([{ type: "text", text: "hello" }]);
    expect(body.usage.input_tokens).toBe(10);
    expect(body.usage.output_tokens).toBe(5);
    expect(body.usage.cache_read_input_tokens).toBe(2);
    expect(body.usage.cache_creation_input_tokens).toBe(1);
    expect(body.stop_reason).toBe("end_turn");

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.model).toBe("claude-3");
    expect(relayCall.stream).toBe(false);
    expect(relayCall.messages[0].content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("系统提示字符串格式", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [{ role: "user", content: "hi" }],
        system: "You are helpful.",
        max_tokens: 1024,
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.systemPrompt).toBe("You are helpful.");
  });

  it("系统提示数组格式", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [{ role: "user", content: "hi" }],
        system: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
        max_tokens: 1024,
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.systemPrompt).toBe("part1\npart2");
  });

  it("工具调用格式转换", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [{ role: "user", content: "hi" }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
        max_tokens: 1024,
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.tools).toEqual([
      {
        name: "get_weather",
        description: "Get weather",
        inputSchema: { type: "object", properties: { city: { type: "string" } } },
      },
    ]);
  });

  it("模型白名单拦截", async () => {
    createTestKey({ allowedModels: ["gpt-4o"] });
    const server = createServer({ relay: mockRelay(), router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: { model: "claude-3", messages: [{ role: "user", content: "hi" }], max_tokens: 1024 },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("forbidden");
  });

  it("消息内容数组格式", async () => {
    createTestKey();
    const relay = mockRelay();
    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: "world" },
            ],
          },
        ],
        max_tokens: 1024,
      },
    });

    const relayCall = (relay.relay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(relayCall.messages[0].content).toEqual([
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ]);
  });
});

describe("POST /v1/messages (stream)", () => {
  it("流式响应返回 SSE", async () => {
    createTestKey();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "hi" } },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 3 } },
      { type: "stop", stopReason: "end_turn", model: "claude-3" },
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
        modelName: "claude-3",
        startTime: Date.now(),
      } satisfies RelayStreamResult),
    });

    const server = createServer({ relay, router: mockRouter(), db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { authorization: "Bearer sk-test-123", "content-type": "application/json" },
      payload: {
        model: "claude-3",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        max_tokens: 1024,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");

    const body = res.body;
    expect(body).toContain("event: message_start");
    expect(body).toContain("event: content_block_start");
    expect(body).toContain("event: content_block_delta");
    expect(body).toContain('"text_delta"');
    expect(body).toContain('"hi"');
    expect(body).toContain("event: message_delta");
    expect(body).toContain('"end_turn"');
    expect(body).toContain("event: message_stop");
  });
});

describe("GET /v1/models", () => {
  it("返回所有 group 名称", async () => {
    createTestKey();
    const router = mockRouter(["claude-3", "gpt-4o"]);
    const server = createServer({ relay: mockRelay(), router, db });
    const fastify = server.getFastify();

    const res = await fastify.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer sk-test-123" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "claude-3",
      object: "model",
      created: 0,
      owned_by: "slime-gateway",
    });
    expect(body.data[1].id).toBe("gpt-4o");
  });
});
