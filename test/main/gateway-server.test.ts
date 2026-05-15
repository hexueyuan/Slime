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
