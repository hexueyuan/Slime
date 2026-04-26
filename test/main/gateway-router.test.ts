import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as channelDao from "@/db/models/channelDao";
import * as groupDao from "@/db/models/groupDao";
import { createRouter } from "@/gateway/router";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function makeChannel(name = "ch") {
  return channelDao.createChannel(db, {
    name,
    type: "openai",
    baseUrls: ["https://api.openai.com"],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  });
}

describe("router", () => {
  it("reload loads groups and items", () => {
    const ch = makeChannel();
    const g = groupDao.createGroup(db, { name: "gpt-4o", balanceMode: "round_robin" });
    groupDao.setGroupItems(db, g.id, [
      { channelId: ch.id, modelName: "gpt-4o", priority: 1, weight: 1 },
    ]);

    const router = createRouter();
    router.reload(db);

    expect(router.listGroupNames()).toEqual(["gpt-4o"]);
    const resolved = router.resolve("gpt-4o");
    expect(resolved).toBeDefined();
    expect(resolved!.group.name).toBe("gpt-4o");
    expect(resolved!.items).toHaveLength(1);
    expect(resolved!.items[0].modelName).toBe("gpt-4o");
  });

  it("resolve returns undefined for unknown model", () => {
    const router = createRouter();
    router.reload(db);
    expect(router.resolve("nonexistent")).toBeUndefined();
  });

  it("listGroupNames returns all names", () => {
    groupDao.createGroup(db, { name: "a", balanceMode: "round_robin" });
    groupDao.createGroup(db, { name: "b", balanceMode: "random" });

    const router = createRouter();
    router.reload(db);
    expect(router.listGroupNames()).toEqual(["a", "b"]);
  });

  it("reload refreshes cache", () => {
    groupDao.createGroup(db, { name: "old", balanceMode: "round_robin" });

    const router = createRouter();
    router.reload(db);
    expect(router.resolve("old")).toBeDefined();

    groupDao.deleteGroup(db, groupDao.getGroupByName(db, "old")!.id);
    groupDao.createGroup(db, { name: "new", balanceMode: "round_robin" });

    router.reload(db);
    expect(router.resolve("old")).toBeUndefined();
    expect(router.resolve("new")).toBeDefined();
  });
});
