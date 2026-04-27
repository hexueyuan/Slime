import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as channelDao from "@/db/models/channelDao";
import * as modelDao from "@/db/models/modelDao";
import * as groupDao from "@/db/models/groupDao";
import { createCapabilitySelector } from "@/gateway/selector";
import { createCircuitBreaker } from "@/gateway/circuit";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function setup() {
  groupDao.ensureBuiltinGroups(db);

  const ch = channelDao.createChannel(db, {
    name: "test",
    type: "openai",
    baseUrl: "https://api.openai.com",
    models: [],
    enabled: true,
  });

  function addModel(name: string, caps: string[]) {
    const model = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: name,
      capabilities: caps as any,
      enabled: true,
    });
    groupDao.syncBuiltinGroupItems(db);
    return model;
  }

  return { ch, addModel };
}

describe("CapabilitySelector", () => {
  it("select independent mode — returns best model per capability", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"]);
    addModel("deepseek-r1", ["reasoning"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning", "vision"]);
    expect(result.missing).toEqual([]);
    expect(result.matched.reasoning.modelName).toBe("claude-sonnet");
    expect(result.matched.vision.modelName).toBe("claude-sonnet");
  });

  it("select independent mode — different models for different caps", () => {
    const { addModel } = setup();
    addModel("deepseek-r1", ["reasoning"]);
    addModel("qwen-vl", ["vision"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning", "vision"]);
    expect(result.missing).toEqual([]);
    expect(result.matched.reasoning.modelName).toBe("deepseek-r1");
    expect(result.matched.vision.modelName).toBe("qwen-vl");
  });

  it("select unified mode — single model must match all", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"]);
    addModel("deepseek-r1", ["reasoning"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"]]);
    expect(result.missing).toEqual([]);
    expect(result.matched["reasoning+vision"].modelName).toBe("claude-sonnet");
  });

  it("select unified mode — no single model matches → missing", () => {
    const { addModel } = setup();
    addModel("deepseek-r1", ["reasoning"]);
    addModel("qwen-vl", ["vision"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"]]);
    expect(result.missing).toEqual(["reasoning+vision"]);
    expect(result.matched["reasoning+vision"]).toBeUndefined();
  });

  it("select mixed mode", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"]);
    addModel("dalle", ["image_gen"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"], "image_gen"]);
    expect(result.missing).toEqual([]);
    expect(result.matched["reasoning+vision"].modelName).toBe("claude-sonnet");
    expect(result.matched.image_gen.modelName).toBe("dalle");
  });

  it("select returns first inserted model when multiple match", () => {
    const { addModel } = setup();
    addModel("first", ["reasoning"]);
    addModel("second", ["reasoning"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning"]);
    expect(result.matched.reasoning.modelName).toBe("first");
  });

  it("select skips disabled models", () => {
    const { ch, addModel } = setup();
    addModel("enabled", ["reasoning"]);
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "disabled",
      capabilities: ["reasoning"],
      enabled: false,
    });
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning"]);
    expect(result.matched.reasoning.modelName).toBe("enabled");
  });

  it("select returns missing when no model has capability", () => {
    setup();
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["image_gen"]);
    expect(result.missing).toEqual(["image_gen"]);
  });

  it("hasCapability returns true/false", () => {
    const { addModel } = setup();
    addModel("m", ["reasoning", "vision"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    expect(selector.hasCapability("reasoning")).toBe(true);
    expect(selector.hasCapability("image_gen")).toBe(false);
  });

  it("availableCapabilities returns deduplicated list", () => {
    const { addModel } = setup();
    addModel("a", ["reasoning"]);
    addModel("b", ["reasoning", "vision"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const caps = selector.availableCapabilities();
    expect(caps.sort()).toEqual(["reasoning", "vision"]);
  });

  it("modelsWithCapability returns matching models", () => {
    const { addModel } = setup();
    addModel("m1", ["reasoning"]);
    addModel("m2", ["reasoning"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const models = selector.modelsWithCapability("reasoning");
    expect(models).toHaveLength(2);
  });

  it("groupName in ModelMatch corresponds to built-in capability group name", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning"]);
    expect(result.matched.reasoning.groupName).toBe("reasoning");
  });

  it("groupName for unified mode corresponds to composite group name", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"]);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"]]);
    expect(result.matched["reasoning+vision"].groupName).toBe("reasoning+vision");
  });
});
