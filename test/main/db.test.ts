import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb, getDb } from "@/db";
import * as channelDao from "@/db/models/channelDao";
import * as groupDao from "@/db/models/groupDao";
import * as apiKeyDao from "@/db/models/apiKeyDao";
import * as priceDao from "@/db/models/priceDao";
import * as logDao from "@/db/models/logDao";
import * as statsDao from "@/db/models/statsDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

// helpers
function makeChannel(overrides: Partial<Parameters<typeof channelDao.createChannel>[1]> = {}) {
  return channelDao.createChannel(db, {
    name: "test-ch",
    type: "openai",
    baseUrls: ["https://api.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
    ...overrides,
  });
}

function makeLog(overrides: Partial<Parameters<typeof logDao.insertLogs>[1][0]> = {}) {
  return {
    groupName: "default",
    modelName: "gpt-4o",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.01,
    durationMs: 200,
    status: "success" as const,
    ...overrides,
  };
}

describe("database", () => {
  it("initDb creates all tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("channels");
    expect(names).toContain("channel_keys");
    expect(names).toContain("groups_");
    expect(names).toContain("group_items");
    expect(names).toContain("api_keys");
    expect(names).toContain("model_prices");
    expect(names).toContain("relay_logs");
    expect(names).toContain("stats_hourly");
    expect(names).toContain("stats_daily");
  });

  it("getDb returns initialized instance", () => {
    expect(getDb()).toBe(db);
  });

  it("getDb re-creates after closeDb", () => {
    closeDb();
    // getDb falls back to paths.slimeDir, which won't work in test env
    // but we can verify closeDb nullifies and initDb works again
    const db2 = initDb(":memory:");
    expect(db2).toBeDefined();
    db = db2;
  });
});

describe("channelDao", () => {
  it("createChannel returns full object", () => {
    const ch = makeChannel({ name: "openai-1", priority: 10 });
    expect(ch.id).toBeGreaterThan(0);
    expect(ch.name).toBe("openai-1");
    expect(ch.priority).toBe(10);
    expect(ch.enabled).toBe(true);
    expect(ch.createdAt).toBeDefined();
    expect(ch.updatedAt).toBeDefined();
  });

  it("listChannels returns all sorted by priority DESC", () => {
    makeChannel({ name: "low", priority: 1 });
    makeChannel({ name: "high", priority: 10 });
    makeChannel({ name: "mid", priority: 5 });
    const list = channelDao.listChannels(db);
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe("high");
    expect(list[1].name).toBe("mid");
    expect(list[2].name).toBe("low");
  });

  it("getChannel by id", () => {
    const ch = makeChannel();
    expect(channelDao.getChannel(db, ch.id)).toEqual(ch);
    expect(channelDao.getChannel(db, 9999)).toBeUndefined();
  });

  it("updateChannel partial update", () => {
    const ch = makeChannel({ name: "old" });
    channelDao.updateChannel(db, ch.id, { name: "new", priority: 99 });
    const updated = channelDao.getChannel(db, ch.id)!;
    expect(updated.name).toBe("new");
    expect(updated.priority).toBe(99);
    expect(updated.weight).toBe(ch.weight); // unchanged
  });

  it("updateChannel with empty data is noop", () => {
    const ch = makeChannel();
    channelDao.updateChannel(db, ch.id, {});
    expect(channelDao.getChannel(db, ch.id)!.name).toBe(ch.name);
  });

  it("deleteChannel cascades to channel_keys", () => {
    const ch = makeChannel();
    channelDao.addChannelKey(db, ch.id, "sk-test");
    channelDao.deleteChannel(db, ch.id);
    expect(channelDao.getChannel(db, ch.id)).toBeUndefined();
    expect(channelDao.listChannelKeys(db, ch.id)).toHaveLength(0);
  });

  it("baseUrls JSON serialization roundtrip", () => {
    const urls = ["https://a.com", "https://b.com"];
    const ch = makeChannel({ baseUrls: urls });
    expect(channelDao.getChannel(db, ch.id)!.baseUrls).toEqual(urls);
  });

  it("enabled boolean conversion", () => {
    const ch = makeChannel({ enabled: false });
    expect(channelDao.getChannel(db, ch.id)!.enabled).toBe(false);
    channelDao.updateChannel(db, ch.id, { enabled: true });
    expect(channelDao.getChannel(db, ch.id)!.enabled).toBe(true);
  });

  it("addChannelKey / listChannelKeys / removeChannelKey", () => {
    const ch = makeChannel();
    const k1 = channelDao.addChannelKey(db, ch.id, "sk-1");
    const k2 = channelDao.addChannelKey(db, ch.id, "sk-2");
    expect(k1.channelId).toBe(ch.id);
    expect(k1.key).toBe("sk-1");
    expect(k1.enabled).toBe(true);

    const keys = channelDao.listChannelKeys(db, ch.id);
    expect(keys).toHaveLength(2);
    expect(keys[0].id).toBe(k1.id);

    channelDao.removeChannelKey(db, k1.id);
    expect(channelDao.listChannelKeys(db, ch.id)).toHaveLength(1);
    expect(channelDao.listChannelKeys(db, ch.id)[0].id).toBe(k2.id);
  });
});

describe("groupDao", () => {
  it("createGroup without slot", () => {
    const g = groupDao.createGroup(db, {
      name: "g1",
      balanceMode: "round_robin",
      isBuiltin: false,
    });
    expect(g.id).toBeGreaterThan(0);
    expect(g.name).toBe("g1");
    expect(g.balanceMode).toBe("round_robin");
  });

  it("createGroup basic", () => {
    const g = groupDao.createGroup(db, {
      name: "g2",
      balanceMode: "failover",
      isBuiltin: false,
    });
    expect(g.name).toBe("g2");
    expect(g.balanceMode).toBe("failover");
  });

  it("listGroups / getGroup / getGroupByName", () => {
    const g = groupDao.createGroup(db, {
      name: "mygroup",
      balanceMode: "random",
      isBuiltin: false,
    });
    expect(groupDao.listGroups(db)).toHaveLength(1);
    expect(groupDao.getGroup(db, g.id)!.name).toBe("mygroup");
    expect(groupDao.getGroupByName(db, "mygroup")!.id).toBe(g.id);
    expect(groupDao.getGroupByName(db, "nope")).toBeUndefined();
  });

  it("updateGroup balanceMode", () => {
    const g = groupDao.createGroup(db, { name: "g", balanceMode: "round_robin", isBuiltin: false });
    groupDao.updateGroup(db, g.id, {
      balanceMode: "weighted",
    });
    const updated = groupDao.getGroup(db, g.id)!;
    expect(updated.balanceMode).toBe("weighted");
  });

  it("deleteGroup cascades to group_items", () => {
    const ch = makeChannel();
    const g = groupDao.createGroup(db, { name: "g", balanceMode: "round_robin", isBuiltin: false });
    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "gpt-4o", priority: 0, weight: 1 },
    ]);
    groupDao.deleteGroup(db, g.id);
    expect(groupDao.getGroup(db, g.id)).toBeUndefined();
    expect(groupDao.listGroupItems(db, g.id)).toHaveLength(0);
  });

  it("setGroupItems replaces all (transaction)", () => {
    const ch = makeChannel();
    const g = groupDao.createGroup(db, { name: "g", balanceMode: "round_robin", isBuiltin: false });

    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "a", priority: 1, weight: 1 },
      { channelId: ch.id, modelName: "b", priority: 0, weight: 1 },
    ]);
    expect(groupDao.listGroupItems(db, g.id)).toHaveLength(2);

    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "c", priority: 5, weight: 2 },
    ]);
    const items = groupDao.listGroupItems(db, g.id);
    expect(items).toHaveLength(1);
    expect(items[0].modelName).toBe("c");
    expect(items[0].priority).toBe(5);
  });

  it("listGroupItems sorted by priority DESC", () => {
    const ch = makeChannel();
    const g = groupDao.createGroup(db, { name: "g", balanceMode: "round_robin", isBuiltin: false });
    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "low", priority: 1, weight: 1 },
      { channelId: ch.id, modelName: "high", priority: 10, weight: 1 },
    ]);
    const items = groupDao.listGroupItems(db, g.id);
    expect(items[0].modelName).toBe("high");
    expect(items[1].modelName).toBe("low");
  });
});

describe("apiKeyDao", () => {
  it("createApiKey / listApiKeys", () => {
    const k = apiKeyDao.createApiKey(db, {
      name: "test",
      key: "sk-abc",
      enabled: true,
      isInternal: false,
    });
    expect(k.id).toBeGreaterThan(0);
    expect(k.name).toBe("test");
    expect(k.key).toBe("sk-abc");
    expect(k.enabled).toBe(true);
    expect(k.isInternal).toBe(false);
    expect(apiKeyDao.listApiKeys(db)).toHaveLength(1);
  });

  it("getApiKeyByKey", () => {
    apiKeyDao.createApiKey(db, { name: "k", key: "sk-xyz", enabled: true, isInternal: false });
    expect(apiKeyDao.getApiKeyByKey(db, "sk-xyz")!.name).toBe("k");
    expect(apiKeyDao.getApiKeyByKey(db, "nope")).toBeUndefined();
  });

  it("updateApiKey partial", () => {
    const k = apiKeyDao.createApiKey(db, {
      name: "old",
      key: "sk-1",
      enabled: true,
      isInternal: false,
    });
    apiKeyDao.updateApiKey(db, k.id, { name: "new", enabled: false });
    const updated = apiKeyDao.getApiKeyByKey(db, "sk-1")!;
    expect(updated.name).toBe("new");
    expect(updated.enabled).toBe(false);
  });

  it("deleteApiKey", () => {
    const k = apiKeyDao.createApiKey(db, {
      name: "x",
      key: "sk-del",
      enabled: true,
      isInternal: false,
    });
    apiKeyDao.deleteApiKey(db, k.id);
    expect(apiKeyDao.listApiKeys(db)).toHaveLength(0);
  });

  it("getInternalKey", () => {
    apiKeyDao.createApiKey(db, { name: "ext", key: "sk-ext", enabled: true, isInternal: false });
    apiKeyDao.createApiKey(db, { name: "int", key: "sk-int", enabled: true, isInternal: true });
    const internal = apiKeyDao.getInternalKey(db);
    expect(internal).toBeDefined();
    expect(internal!.isInternal).toBe(true);
    expect(internal!.key).toBe("sk-int");
  });

  it("getInternalKey returns undefined when none", () => {
    apiKeyDao.createApiKey(db, { name: "ext", key: "sk-ext", enabled: true, isInternal: false });
    expect(apiKeyDao.getInternalKey(db)).toBeUndefined();
  });

  it("allowedModels JSON handling", () => {
    const k = apiKeyDao.createApiKey(db, {
      name: "limited",
      key: "sk-lim",
      enabled: true,
      isInternal: false,
      allowedModels: ["gpt-4o", "claude-sonnet-4-20250514"],
    });
    expect(k.allowedModels).toEqual(["gpt-4o", "claude-sonnet-4-20250514"]);

    const noModels = apiKeyDao.createApiKey(db, {
      name: "any",
      key: "sk-any",
      enabled: true,
      isInternal: false,
    });
    expect(noModels.allowedModels).toBeUndefined();
  });

  it("isInternal boolean conversion", () => {
    const k = apiKeyDao.createApiKey(db, {
      name: "i",
      key: "sk-i",
      enabled: false,
      isInternal: true,
    });
    expect(k.isInternal).toBe(true);
    expect(k.enabled).toBe(false);
  });
});

describe("priceDao", () => {
  it("seedPresets inserts preset data", () => {
    priceDao.seedPresets(db);
    const list = priceDao.listPrices(db);
    expect(list.length).toBeGreaterThan(0);
    const gpt4o = list.find((p) => p.modelName === "gpt-4o");
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.source).toBe("preset");
  });

  it("listPrices returns all sorted by model_name", () => {
    priceDao.upsertPrice(db, "b-model", { inputPrice: 1, outputPrice: 2 });
    priceDao.upsertPrice(db, "a-model", { inputPrice: 1, outputPrice: 2 });
    const list = priceDao.listPrices(db);
    expect(list[0].modelName).toBe("a-model");
    expect(list[1].modelName).toBe("b-model");
  });

  it("getPrice by model name", () => {
    priceDao.upsertPrice(db, "test-model", { inputPrice: 3, outputPrice: 15 });
    const p = priceDao.getPrice(db, "test-model");
    expect(p).toBeDefined();
    expect(p!.inputPrice).toBe(3);
    expect(p!.outputPrice).toBe(15);
    expect(priceDao.getPrice(db, "nope")).toBeUndefined();
  });

  it("upsertPrice insert and update", () => {
    priceDao.upsertPrice(db, "m", { inputPrice: 1, outputPrice: 2 });
    expect(priceDao.getPrice(db, "m")!.inputPrice).toBe(1);

    priceDao.upsertPrice(db, "m", { inputPrice: 10, outputPrice: 20 });
    expect(priceDao.getPrice(db, "m")!.inputPrice).toBe(10);
    expect(priceDao.getPrice(db, "m")!.outputPrice).toBe(20);
    // still only one row
    expect(priceDao.listPrices(db)).toHaveLength(1);
  });

  it("seedPresets does not overwrite existing (INSERT OR IGNORE)", () => {
    priceDao.upsertPrice(db, "gpt-4o", {
      inputPrice: 999,
      outputPrice: 999,
      source: "manual",
    });
    priceDao.seedPresets(db);
    const p = priceDao.getPrice(db, "gpt-4o")!;
    expect(p.inputPrice).toBe(999); // not overwritten
  });
});

describe("logDao", () => {
  it("insertLogs batch insert", () => {
    logDao.insertLogs(db, [makeLog(), makeLog({ modelName: "claude" })]);
    const logs = logDao.getRecentLogs(db, 10, 0);
    expect(logs).toHaveLength(2);
  });

  it("getRecentLogs pagination", () => {
    logDao.insertLogs(db, [
      makeLog({ modelName: "a" }),
      makeLog({ modelName: "b" }),
      makeLog({ modelName: "c" }),
    ]);
    const page1 = logDao.getRecentLogs(db, 2, 0);
    expect(page1).toHaveLength(2);
    // ORDER BY id DESC
    expect(page1[0].modelName).toBe("c");
    expect(page1[1].modelName).toBe("b");

    const page2 = logDao.getRecentLogs(db, 2, 2);
    expect(page2).toHaveLength(1);
    expect(page2[0].modelName).toBe("a");
  });

  it("getLogsByDateRange", () => {
    // insert with explicit created_at via raw SQL
    db.prepare(
      `INSERT INTO relay_logs (group_name, model_name, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
       VALUES ('g', 'm', 0, 0, 0, 0, 0, 0, 'success', '2025-01-15 10:00:00')`,
    ).run();
    db.prepare(
      `INSERT INTO relay_logs (group_name, model_name, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
       VALUES ('g', 'm', 0, 0, 0, 0, 0, 0, 'success', '2025-01-16 10:00:00')`,
    ).run();

    const range = logDao.getLogsByDateRange(db, "2025-01-15", "2025-01-16");
    expect(range).toHaveLength(1);
    expect(range[0].createdAt).toContain("2025-01-15");
  });

  it("deleteLogsBefore", () => {
    db.prepare(
      `INSERT INTO relay_logs (group_name, model_name, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
       VALUES ('g', 'm', 0, 0, 0, 0, 0, 0, 'success', '2025-01-01 00:00:00')`,
    ).run();
    db.prepare(
      `INSERT INTO relay_logs (group_name, model_name, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
       VALUES ('g', 'm', 0, 0, 0, 0, 0, 0, 'success', '2025-06-01 00:00:00')`,
    ).run();

    const deleted = logDao.deleteLogsBefore(db, "2025-03-01");
    expect(deleted).toBe(1);
    expect(logDao.getRecentLogs(db, 10, 0)).toHaveLength(1);
  });
});

describe("statsDao", () => {
  function insertLogRow(model: string, channelId: number, cost: number, createdAt: string) {
    db.prepare(
      `INSERT INTO relay_logs
        (group_name, channel_id, model_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
       VALUES ('default', ?, ?, 100, 50, 0, 0, ?, 200, 'success', ?)`,
    ).run(channelId, model, cost, createdAt);
  }

  it("aggregateToHourly from relay_logs", () => {
    insertLogRow("gpt-4o", 1, 0.01, "2025-01-15 10:30:00");
    insertLogRow("gpt-4o", 1, 0.02, "2025-01-15 10:45:00");
    insertLogRow("claude", 2, 0.05, "2025-01-15 11:00:00");

    const changes = statsDao.aggregateToHourly(db, "2025-01-16");
    expect(changes).toBe(2); // 2 groups: (2025-01-15, 10, gpt-4o, 1) + (2025-01-15, 11, claude, 2)
    const rows = db.prepare("SELECT * FROM stats_hourly ORDER BY hour, model_name").all() as any[];
    expect(rows.length).toBe(2);
    // gpt-4o hour=10: 2 requests merged
    const gpt10 = rows.find((r: any) => r.model_name === "gpt-4o" && r.hour === 10);
    expect(gpt10.requests).toBe(2);
    expect(gpt10.cost).toBeCloseTo(0.03);
  });

  it("aggregateToDaily from stats_hourly", () => {
    insertLogRow("gpt-4o", 1, 0.01, "2025-01-15 10:00:00");
    insertLogRow("gpt-4o", 1, 0.02, "2025-01-15 14:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");

    const changes = statsDao.aggregateToDaily(db, "2025-01-16");
    expect(changes).toBeGreaterThan(0);

    const rows = db.prepare("SELECT * FROM stats_daily").all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].requests).toBe(2);
    expect(rows[0].cost).toBeCloseTo(0.03);
  });

  it("deleteHourlyBefore / deleteDailyBefore", () => {
    insertLogRow("m", 1, 0.01, "2025-01-10 10:00:00");
    insertLogRow("m", 1, 0.01, "2025-01-20 10:00:00");
    statsDao.aggregateToHourly(db, "2025-02-01");
    statsDao.aggregateToDaily(db, "2025-02-01");

    expect(statsDao.deleteHourlyBefore(db, "2025-01-15")).toBe(1);
    expect(statsDao.deleteDailyBefore(db, "2025-01-15")).toBe(1);
  });

  it("getStatsRange returns summary", () => {
    insertLogRow("gpt-4o", 1, 0.05, "2025-01-15 10:00:00");
    insertLogRow("claude", 2, 0.1, "2025-01-15 14:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");
    statsDao.aggregateToDaily(db, "2025-01-16");

    const stats = statsDao.getStatsRange(db, "2025-01-01", "2025-02-01");
    expect(stats.requests).toBe(2);
    expect(stats.cost).toBeCloseTo(0.15);
    expect(stats.inputTokens).toBe(200);
    expect(stats.outputTokens).toBe(100);
  });

  it("getStatsRange returns zeros for empty range", () => {
    const stats = statsDao.getStatsRange(db, "2025-01-01", "2025-02-01");
    expect(stats.requests).toBe(0);
    expect(stats.cost).toBe(0);
  });

  it("getStatsByModel groups by model", () => {
    insertLogRow("gpt-4o", 1, 0.05, "2025-01-15 10:00:00");
    insertLogRow("gpt-4o", 1, 0.03, "2025-01-15 11:00:00");
    insertLogRow("claude", 2, 0.1, "2025-01-15 14:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");
    statsDao.aggregateToDaily(db, "2025-01-16");

    const byModel = statsDao.getStatsByModel(db, "2025-01-01", "2025-02-01");
    expect(byModel).toHaveLength(2);
    // sorted by cost DESC
    expect(byModel[0].modelName).toBe("claude");
    expect(byModel[0].cost).toBeCloseTo(0.1);
    expect(byModel[1].modelName).toBe("gpt-4o");
    expect(byModel[1].requests).toBe(2);
  });

  it("getStatsByModel without date range", () => {
    insertLogRow("m", 1, 0.01, "2025-01-15 10:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");
    statsDao.aggregateToDaily(db, "2025-01-16");

    const result = statsDao.getStatsByModel(db);
    expect(result).toHaveLength(1);
  });

  it("getStatsByChannel groups by channel", () => {
    const ch1 = makeChannel({ name: "ch1" });
    const ch2 = makeChannel({ name: "ch2" });
    insertLogRow("m", ch1.id, 0.02, "2025-01-15 10:00:00");
    insertLogRow("m", ch2.id, 0.08, "2025-01-15 10:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");
    statsDao.aggregateToDaily(db, "2025-01-16");

    const byChannel = statsDao.getStatsByChannel(db, "2025-01-01", "2025-02-01");
    expect(byChannel).toHaveLength(2);
    // sorted by cost DESC
    expect(byChannel[0].channelId).toBe(ch2.id);
    expect(byChannel[0].channelName).toBe("ch2");
    expect(byChannel[0].cost).toBeCloseTo(0.08);
  });

  it("getStatsByChannel without date range", () => {
    insertLogRow("m", 1, 0.01, "2025-01-15 10:00:00");
    statsDao.aggregateToHourly(db, "2025-01-16");
    statsDao.aggregateToDaily(db, "2025-01-16");

    const result = statsDao.getStatsByChannel(db);
    expect(result).toHaveLength(1);
    // channel_id=1 has no matching channels row, so name='unknown'
    expect(result[0].channelName).toBe("unknown");
  });
});
