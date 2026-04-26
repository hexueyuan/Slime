import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDb, closeDb } from "@/db";
import * as channelDao from "@/db/models/channelDao";
import * as groupDao from "@/db/models/groupDao";
import { createRouter } from "@/gateway/router";
import { createBalancer } from "@/gateway/balancer";
import { createCircuitBreaker } from "@/gateway/circuit";
import { createKeyPool } from "@/gateway/keypool";
import { createRelay } from "@/gateway/relay";
import type { InternalRequest, InternalResponse, StreamEvent } from "@/gateway/outbound/types";
import type BetterSqlite3 from "better-sqlite3";

vi.mock("@/gateway/outbound/registry", () => ({
  getAdapter: vi.fn(),
}));

import { getAdapter } from "@/gateway/outbound/registry";
const mockGetAdapter = vi.mocked(getAdapter);

let db: BetterSqlite3.Database;

const baseRequest: InternalRequest = {
  model: "gpt-4o",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  stream: false,
};

const baseResponse: InternalResponse = {
  content: [{ type: "text", text: "hello" }],
  usage: { inputTokens: 10, outputTokens: 5 },
  model: "gpt-4o",
  stopReason: "end_turn",
};

function setup() {
  const ch1 = channelDao.createChannel(db, {
    name: "ch1",
    type: "openai",
    baseUrls: ["https://api.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  });
  channelDao.addChannelKey(db, ch1.id, "sk-1");

  const ch2 = channelDao.createChannel(db, {
    name: "ch2",
    type: "openai",
    baseUrls: ["https://api2.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  });
  channelDao.addChannelKey(db, ch2.id, "sk-2");

  const g = groupDao.createGroup(db, { name: "gpt-4o", balanceMode: "failover" });
  groupDao.setGroupItems(db, g.id, [
    { channelId: ch1.id, modelName: "gpt-4o-2024", priority: 10, weight: 1 },
    { channelId: ch2.id, modelName: "gpt-4o-2024", priority: 5, weight: 1 },
  ]);

  return { ch1, ch2, g };
}

function createDeps() {
  const router = createRouter();
  router.reload(db);
  return {
    db,
    router,
    balancer: createBalancer(),
    circuitBreaker: createCircuitBreaker(),
    keyPool: createKeyPool(),
  };
}

beforeEach(() => {
  db = initDb(":memory:");
  vi.clearAllMocks();
});

afterEach(() => {
  closeDb();
});

describe("relay", () => {
  it("正常转发成功", async () => {
    setup();
    const send = vi.fn().mockResolvedValue(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const result = await relay.relay(baseRequest);

    expect(result.channelName).toBe("ch1");
    expect(result.modelName).toBe("gpt-4o-2024");
    expect(result.response).toEqual(baseResponse);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // 验证请求中的 model 被替换为上游 modelName
    expect(send.mock.calls[0][0].model).toBe("gpt-4o-2024");
  });

  it("第一个候选失败后重试第二个", async () => {
    setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const result = await relay.relay(baseRequest);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.channelName).toBe("ch2");
  });

  it("429 触发 mark429", async () => {
    const { ch1 } = setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit exceeded"))
      .mockResolvedValueOnce(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const deps = createDeps();
    const mark429Spy = vi.spyOn(deps.keyPool, "mark429");
    const relay = createRelay(deps);
    await relay.relay(baseRequest);

    expect(mark429Spy).toHaveBeenCalledWith(ch1.id, expect.any(Number));
  });

  it("全部候选失败抛错", async () => {
    setup();
    const send = vi.fn().mockRejectedValue(new Error("fail"));
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    await expect(relay.relay(baseRequest)).rejects.toThrow("fail");
  });

  it("模型未命中抛错", async () => {
    setup();
    const relay = createRelay(createDeps());
    await expect(relay.relay({ ...baseRequest, model: "unknown" })).rejects.toThrow(
      "model not found: unknown",
    );
  });

  it("statsCallback 被调用（成功和失败都调）", async () => {
    setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    await relay.relay(baseRequest);

    expect(statsCalls).toHaveLength(2);
    expect((statsCalls[0] as { status: string }).status).toBe("error");
    expect((statsCalls[1] as { status: string }).status).toBe("success");
  });

  it("statsCallback 包含 requestBody 和 responseBody", async () => {
    setup();
    const send = vi.fn().mockResolvedValue(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    await relay.relay(baseRequest);

    expect(statsCalls).toHaveLength(1);
    const call = statsCalls[0] as { requestBody?: string; responseBody?: string };
    expect(call.requestBody).toBeDefined();
    expect(JSON.parse(call.requestBody!).model).toBe("gpt-4o");
    expect(call.responseBody).toBeDefined();
    expect(JSON.parse(call.responseBody!).content).toEqual(baseResponse.content);
  });

  it("statsCallback 失败时 responseBody 为 undefined", async () => {
    setup();
    const send = vi.fn().mockRejectedValue(new Error("fail"));
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    await relay.relay(baseRequest).catch(() => {});

    for (const call of statsCalls) {
      expect((call as { responseBody?: string }).responseBody).toBeUndefined();
    }
  });

  it("跳过 disabled channel", async () => {
    const ch = channelDao.createChannel(db, {
      name: "disabled",
      type: "openai",
      baseUrls: ["https://api.openai.com"],
      models: [],
      enabled: false,
      priority: 0,
      weight: 1,
    });
    channelDao.addChannelKey(db, ch.id, "sk-d");
    const ch2 = channelDao.createChannel(db, {
      name: "active",
      type: "openai",
      baseUrls: ["https://api2.openai.com"],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    });
    channelDao.addChannelKey(db, ch2.id, "sk-a");

    const g = groupDao.createGroup(db, { name: "gpt-4o", balanceMode: "failover" });
    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "gpt-4o", priority: 10, weight: 1 },
      { channelId: ch2.id, modelName: "gpt-4o", priority: 5, weight: 1 },
    ]);

    const send = vi.fn().mockResolvedValue(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const result = await relay.relay(baseRequest);

    expect(result.channelName).toBe("active");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("relayStream", () => {
  it("正常流式返回", async () => {
    setup();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "hi" } },
      { type: "stop", stopReason: "end_turn", model: "gpt-4o-2024" },
    ];

    async function* fakeStream(): AsyncIterable<StreamEvent> {
      for (const e of events) yield e;
    }

    mockGetAdapter.mockReturnValue({
      send: vi.fn(),
      sendStream: vi.fn().mockReturnValue(fakeStream()),
    });

    const relay = createRelay(createDeps());
    const result = await relay.relayStream(baseRequest);

    expect(result.channelName).toBe("ch1");
    expect(result.modelName).toBe("gpt-4o-2024");

    const collected: StreamEvent[] = [];
    for await (const e of result.stream) collected.push(e);
    expect(collected).toEqual(events);
  });

  it("连接失败 fallback 到下一个候选", async () => {
    setup();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "ok" } },
      { type: "stop", stopReason: "end_turn", model: "gpt-4o-2024" },
    ];

    async function* failStream(): AsyncIterable<StreamEvent> {
      throw new Error("connection refused");
      yield undefined as never; // make TS happy
    }

    async function* okStream(): AsyncIterable<StreamEvent> {
      for (const e of events) yield e;
    }

    const sendStream = vi.fn().mockReturnValueOnce(failStream()).mockReturnValueOnce(okStream());
    mockGetAdapter.mockReturnValue({ send: vi.fn(), sendStream });

    const relay = createRelay(createDeps());
    const result = await relay.relayStream(baseRequest);

    expect(result.channelName).toBe("ch2");

    const collected: StreamEvent[] = [];
    for await (const e of result.stream) collected.push(e);
    expect(collected).toEqual(events);
  });

  it("全部候选流式失败抛错", async () => {
    setup();
    async function* failStream(): AsyncIterable<StreamEvent> {
      throw new Error("fail");
      yield undefined as never;
    }

    mockGetAdapter.mockReturnValue({
      send: vi.fn(),
      sendStream: vi.fn().mockImplementation(() => failStream()),
    });

    const relay = createRelay(createDeps());
    await expect(relay.relayStream(baseRequest)).rejects.toThrow("fail");
  });

  it("statsCallback 包含流式累积的 responseBody", async () => {
    setup();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "hello " } },
      { type: "content_delta", delta: { type: "text", text: "world" } },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } },
      { type: "stop", stopReason: "end_turn", model: "gpt-4o-2024" },
    ];

    async function* fakeStream(): AsyncIterable<StreamEvent> {
      for (const e of events) yield e;
    }

    mockGetAdapter.mockReturnValue({
      send: vi.fn(),
      sendStream: vi.fn().mockReturnValue(fakeStream()),
    });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    const result = await relay.relayStream(baseRequest);
    // 消费流触发 stats
    for await (const _ of result.stream) {
      /* drain */
    }

    expect(statsCalls).toHaveLength(1);
    const call = statsCalls[0] as { requestBody?: string; responseBody?: string };
    expect(call.requestBody).toBeDefined();
    expect(JSON.parse(call.requestBody!).model).toBe("gpt-4o");
    expect(call.responseBody).toBeDefined();
    const respBody = JSON.parse(call.responseBody!);
    expect(respBody.content).toEqual([{ type: "text", text: "hello world" }]);
    expect(respBody.usage.inputTokens).toBe(10);
  });
});
