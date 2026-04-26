import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as modelDao from "@/db/models/modelDao";
import * as channelDao from "@/db/models/channelDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function makeChannel() {
  return channelDao.createChannel(db, {
    name: "test-ch",
    type: "openai",
    baseUrls: ["https://api.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  });
}

describe("modelDao", () => {
  it("createModel returns full object", () => {
    const ch = makeChannel();
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "gpt-4o",
      capabilities: ["reasoning", "chat", "vision"],
      priority: 10,
      enabled: true,
    });
    expect(m.id).toBeGreaterThan(0);
    expect(m.modelName).toBe("gpt-4o");
    expect(m.capabilities).toEqual(["reasoning", "chat", "vision"]);
    expect(m.priority).toBe(10);
    expect(m.enabled).toBe(true);
  });

  it("listModels returns all sorted by priority DESC", () => {
    const ch = makeChannel();
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "low",
      capabilities: ["chat"],
      priority: 1,
      enabled: true,
    });
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "high",
      capabilities: ["chat"],
      priority: 10,
      enabled: true,
    });
    const list = modelDao.listModels(db);
    expect(list).toHaveLength(2);
    expect(list[0].modelName).toBe("high");
    expect(list[1].modelName).toBe("low");
  });

  it("listModelsByChannel filters by channel", () => {
    const ch1 = makeChannel();
    const ch2 = channelDao.createChannel(db, {
      name: "ch2",
      type: "anthropic",
      baseUrls: ["https://api.anthropic.com"],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    });
    modelDao.createModel(db, {
      channelId: ch1.id,
      modelName: "a",
      capabilities: ["chat"],
      priority: 0,
      enabled: true,
    });
    modelDao.createModel(db, {
      channelId: ch2.id,
      modelName: "b",
      capabilities: ["chat"],
      priority: 0,
      enabled: true,
    });
    expect(modelDao.listModelsByChannel(db, ch1.id)).toHaveLength(1);
    expect(modelDao.listModelsByChannel(db, ch1.id)[0].modelName).toBe("a");
  });

  it("updateModel partial update", () => {
    const ch = makeChannel();
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "x",
      capabilities: ["chat"],
      priority: 0,
      enabled: true,
    });
    modelDao.updateModel(db, m.id, { capabilities: ["reasoning", "vision"], priority: 20 });
    const updated = modelDao.getModel(db, m.id)!;
    expect(updated.capabilities).toEqual(["reasoning", "vision"]);
    expect(updated.priority).toBe(20);
    expect(updated.enabled).toBe(true);
  });

  it("deleteModel removes row", () => {
    const ch = makeChannel();
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "x",
      capabilities: [],
      priority: 0,
      enabled: true,
    });
    modelDao.deleteModel(db, m.id);
    expect(modelDao.getModel(db, m.id)).toBeUndefined();
  });

  it("UNIQUE(channel_id, model_name) constraint", () => {
    const ch = makeChannel();
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "dup",
      capabilities: [],
      priority: 0,
      enabled: true,
    });
    expect(() =>
      modelDao.createModel(db, {
        channelId: ch.id,
        modelName: "dup",
        capabilities: [],
        priority: 0,
        enabled: true,
      }),
    ).toThrow();
  });

  it("cascade delete when channel is deleted", () => {
    const ch = makeChannel();
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "x",
      capabilities: [],
      priority: 0,
      enabled: true,
    });
    channelDao.deleteChannel(db, ch.id);
    expect(modelDao.listModels(db)).toHaveLength(0);
  });
});
