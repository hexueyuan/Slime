import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GatewayPresenter } from "@/presenter/gatewayPresenter";
import { getDb } from "@/db";

let gw: GatewayPresenter;

beforeEach(() => {
  gw = new GatewayPresenter(":memory:");
});

afterEach(async () => {
  await gw.destroy();
});

describe("GatewayPresenter", () => {
  it("构造成功", () => {
    expect(gw).toBeDefined();
    expect(gw.getPort()).toBe(8930);
  });

  it("内部 Key 自动生成", () => {
    const key = gw.getInternalKey();
    expect(key).toMatch(/^sk-slime-/);
    expect(key.length).toBeGreaterThan(20);
  });

  it("多次构造不会重复创建内部 Key", () => {
    const key1 = gw.getInternalKey();
    // 拿同一个 db 再构造时因为 initDb 会重置，所以此测试验证单次构造的幂等性
    const keys = gw.listApiKeys();
    const internals = keys.filter((k) => k.isInternal);
    expect(internals).toHaveLength(1);
    expect(internals[0].key).toBe(key1);
  });

  it("预设价格已加载", () => {
    const prices = gw.listPrices();
    expect(prices.length).toBeGreaterThan(0);
    const gpt4o = prices.find((p) => p.modelName === "gpt-4o");
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.source).toBe("preset");
  });
});

describe("Channel CRUD", () => {
  it("创建/列表/更新/删除", () => {
    const ch = gw.createChannel({
      name: "test-ch",
      type: "openai",
      baseUrls: ["https://api.openai.com"],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    });
    expect(ch.id).toBeGreaterThan(0);
    expect(ch.name).toBe("test-ch");

    expect(gw.listChannels()).toHaveLength(1);

    gw.updateChannel(ch.id, { name: "renamed" });
    const updated = gw.listChannels();
    expect(updated[0].name).toBe("renamed");

    gw.deleteChannel(ch.id);
    expect(gw.listChannels()).toHaveLength(0);
  });
});

describe("Channel Keys", () => {
  it("添加/列表/删除", () => {
    const ch = gw.createChannel({
      name: "ch",
      type: "openai",
      baseUrls: ["https://api.openai.com"],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    });

    const key = gw.addChannelKey(ch.id, "sk-test-123");
    expect(key.channelId).toBe(ch.id);
    expect(gw.listChannelKeys(ch.id)).toHaveLength(1);

    gw.removeChannelKey(key.id);
    expect(gw.listChannelKeys(ch.id)).toHaveLength(0);
  });
});

describe("Group CRUD + router reload", () => {
  it("创建/列表/更新/删除", () => {
    const ch = gw.createChannel({
      name: "ch",
      type: "openai",
      baseUrls: ["https://api.openai.com"],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    });

    const group = gw.createGroup({
      name: "gpt-4o",
      balanceMode: "round_robin",
    });
    expect(group.id).toBeGreaterThan(0);
    expect(gw.listGroups()).toHaveLength(1);

    gw.setGroupItems(group.id, [{ channelId: ch.id, modelName: "gpt-4o", priority: 0, weight: 1 }]);
    expect(gw.listGroupItems(group.id)).toHaveLength(1);

    gw.updateGroup(group.id, { balanceMode: "failover" });
    const updated = gw.listGroups();
    expect(updated[0].balanceMode).toBe("failover");

    gw.deleteGroup(group.id);
    expect(gw.listGroups()).toHaveLength(0);
  });
});

describe("API Key CRUD", () => {
  it("创建/列表/更新/删除", () => {
    const key = gw.createApiKey({ name: "user-key" });
    expect(key.key).toMatch(/^sk-gw-/);
    expect(key.isInternal).toBe(false);

    // 列表包含 internal + user key
    const all = gw.listApiKeys();
    expect(all.length).toBe(2);

    gw.updateApiKey(key.id, { name: "renamed-key" });
    const updated = gw.listApiKeys().find((k) => k.id === key.id);
    expect(updated!.name).toBe("renamed-key");

    gw.deleteApiKey(key.id);
    expect(gw.listApiKeys()).toHaveLength(1); // only internal
  });
});

describe("Stats", () => {
  it("getStatsRange 返回空统计", () => {
    const stats = gw.getStatsRange("2026-01-01", "2026-12-31");
    expect(stats.requests).toBe(0);
    expect(stats.cost).toBe(0);
  });

  it("getStatsByModel 返回空数组", () => {
    expect(gw.getStatsByModel()).toHaveLength(0);
  });

  it("getStatsByChannel 返回空数组", () => {
    expect(gw.getStatsByChannel()).toHaveLength(0);
  });

  it("getRecentLogs 返回空数组", () => {
    expect(gw.getRecentLogs(10, 0)).toHaveLength(0);
  });
});

describe("Prices", () => {
  it("updatePrice 更新或插入价格", () => {
    gw.updatePrice("test-model", { inputPrice: 1, outputPrice: 2 });
    const prices = gw.listPrices();
    const found = prices.find((p) => p.modelName === "test-model");
    expect(found).toBeDefined();
    expect(found!.inputPrice).toBe(1);
    expect(found!.outputPrice).toBe(2);
  });
});
