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
  const ch = channelDao.createChannel(db, {
    name: "test",
    type: "openai",
    baseUrls: ["https://api.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  });

  function addModel(name: string, caps: string[], priority: number) {
    const g = groupDao.createGroup(db, { name, balanceMode: "failover" });
    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: name, priority: 0, weight: 1 },
    ]);
    return modelDao.createModel(db, {
      channelId: ch.id,
      modelName: name,
      capabilities: caps as any,
      priority,
      enabled: true,
    });
  }

  return { ch, addModel };
}

describe("CapabilitySelector", () => {
  it("select independent mode — returns best model per capability", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "chat", "vision"], 10);
    addModel("deepseek-r1", ["reasoning", "chat"], 5);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning", "vision"]);
    expect(result.missing).toEqual([]);
    expect(result.matched.reasoning.modelName).toBe("claude-sonnet");
    expect(result.matched.vision.modelName).toBe("claude-sonnet");
  });

  it("select independent mode — different models for different caps", () => {
    const { addModel } = setup();
    addModel("deepseek-r1", ["reasoning"], 10);
    addModel("qwen-vl", ["vision"], 5);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning", "vision"]);
    expect(result.missing).toEqual([]);
    expect(result.matched.reasoning.modelName).toBe("deepseek-r1");
    expect(result.matched.vision.modelName).toBe("qwen-vl");
  });

  it("select unified mode — single model must match all", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"], 10);
    addModel("deepseek-r1", ["reasoning"], 5);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"]]);
    expect(result.missing).toEqual([]);
    expect(result.matched["reasoning+vision"].modelName).toBe("claude-sonnet");
  });

  it("select unified mode — no single model matches → missing", () => {
    const { addModel } = setup();
    addModel("deepseek-r1", ["reasoning"], 10);
    addModel("qwen-vl", ["vision"], 5);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"]]);
    expect(result.missing).toEqual(["reasoning+vision"]);
    expect(result.matched["reasoning+vision"]).toBeUndefined();
  });

  it("select mixed mode", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning", "vision"], 10);
    addModel("dalle", ["image_gen"], 5);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select([["reasoning", "vision"], "image_gen"]);
    expect(result.missing).toEqual([]);
    expect(result.matched["reasoning+vision"].modelName).toBe("claude-sonnet");
    expect(result.matched.image_gen.modelName).toBe("dalle");
  });

  it("select respects priority ordering", () => {
    const { addModel } = setup();
    addModel("cheap", ["reasoning"], 1);
    addModel("expensive", ["reasoning"], 100);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning"]);
    expect(result.matched.reasoning.modelName).toBe("expensive");
  });

  it("select skips disabled models", () => {
    const { ch, addModel } = setup();
    addModel("enabled", ["reasoning"], 5);
    modelDao.createModel(db, {
      channelId: ch.id,
      modelName: "disabled",
      capabilities: ["reasoning"],
      priority: 100,
      enabled: false,
    });
    groupDao.createGroup(db, { name: "disabled", balanceMode: "failover" });
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
    addModel("m", ["reasoning", "chat"], 1);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    expect(selector.hasCapability("reasoning")).toBe(true);
    expect(selector.hasCapability("image_gen")).toBe(false);
  });

  it("availableCapabilities returns deduplicated list", () => {
    const { addModel } = setup();
    addModel("a", ["reasoning", "chat"], 1);
    addModel("b", ["reasoning", "vision"], 2);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const caps = selector.availableCapabilities();
    expect(caps.sort()).toEqual(["chat", "reasoning", "vision"]);
  });

  it("modelsWithCapability returns matching models sorted by priority", () => {
    const { addModel } = setup();
    addModel("low", ["reasoning"], 1);
    addModel("high", ["reasoning"], 10);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const models = selector.modelsWithCapability("reasoning");
    expect(models).toHaveLength(2);
    expect(models[0].modelName).toBe("high");
    expect(models[1].modelName).toBe("low");
  });

  it("groupName in ModelMatch corresponds to a group with same name as model", () => {
    const { addModel } = setup();
    addModel("claude-sonnet", ["reasoning"], 10);
    const selector = createCapabilitySelector(db, createCircuitBreaker());

    const result = selector.select(["reasoning"]);
    expect(result.matched.reasoning.groupName).toBe("claude-sonnet");
  });
});
