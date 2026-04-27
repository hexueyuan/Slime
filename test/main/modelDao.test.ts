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
    baseUrl: "https://api.openai.com",
    models: [],
    enabled: true,
  });
}

describe("modelDao", () => {
  it("createModel returns full object", () => {
    const ch = makeChannel();
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "gpt-4o",
      capabilities: ["reasoning", "vision"],
      enabled: true,
    });
    expect(m.id).toBeGreaterThan(0);
    expect(m.modelName).toBe("gpt-4o");
    expect(m.capabilities).toEqual(["reasoning", "vision"]);
    expect(m.enabled).toBe(true);
  });

  it("listModels returns all sorted by id", () => {
    const ch = makeChannel();
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "first",
      capabilities: ["reasoning"],
      enabled: true,
    });
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "second",
      capabilities: ["reasoning"],
      enabled: true,
    });
    const list = modelDao.listModels(db);
    expect(list).toHaveLength(2);
    expect(list[0].modelName).toBe("first");
    expect(list[1].modelName).toBe("second");
  });

  it("listModelsByChannel filters by channel", () => {
    const ch1 = makeChannel();
    const ch2 = channelDao.createChannel(db, {
      name: "ch2",
      type: "anthropic",
      baseUrl: "https://api.anthropic.com",
      models: [],
      enabled: true,
    });
    modelDao.createModel(db, {
      channelId: ch1.id,
      modelName: "a",
      capabilities: ["reasoning"],
      enabled: true,
    });
    modelDao.createModel(db, {
      channelId: ch2.id,
      modelName: "b",
      capabilities: ["reasoning"],
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
      capabilities: ["reasoning"],
      enabled: true,
    });
    modelDao.updateModel(db, m.id, { capabilities: ["reasoning", "vision"] });
    const updated = modelDao.getModel(db, m.id)!;
    expect(updated.capabilities).toEqual(["reasoning", "vision"]);
    expect(updated.enabled).toBe(true);
  });

  it("deleteModel removes row", () => {
    const ch = makeChannel();
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "x",
      capabilities: [],
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
      enabled: true,
    });
    expect(() =>
      modelDao.createModel(db, {
        channelId: ch.id,
        modelName: "dup",
        capabilities: [],
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
      enabled: true,
    });
    channelDao.deleteChannel(db, ch.id);
    expect(modelDao.listModels(db)).toHaveLength(0);
  });
});
