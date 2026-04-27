import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as agentDao from "@/db/models/agentDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("agentDao", () => {
  it("agents table created", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain("agents");
  });

  it("create returns full Agent object", () => {
    const agent = agentDao.createAgent(db, {
      id: "test-1",
      name: "Test Agent",
      type: "custom",
      enabled: true,
      protected: false,
    });
    expect(agent.id).toBe("test-1");
    expect(agent.name).toBe("Test Agent");
    expect(agent.type).toBe("custom");
    expect(agent.enabled).toBe(true);
    expect(agent.protected).toBe(false);
    expect(agent.createdAt).toBeGreaterThan(0);
    expect(agent.updatedAt).toBeGreaterThan(0);
  });

  it("list returns enabled agents sorted by protected DESC, updated_at DESC", () => {
    agentDao.createAgent(db, {
      id: "a",
      name: "A",
      type: "custom",
      enabled: true,
      protected: false,
    });
    agentDao.createAgent(db, {
      id: "b",
      name: "B",
      type: "builtin",
      enabled: true,
      protected: true,
    });
    agentDao.createAgent(db, {
      id: "c",
      name: "C",
      type: "custom",
      enabled: false,
      protected: false,
    });
    const list = agentDao.listAgents(db);
    // c is disabled, should not appear
    expect(list).toHaveLength(2);
    // b is protected, should be first
    expect(list[0].id).toBe("b");
    expect(list[1].id).toBe("a");
  });

  it("getById returns agent or undefined", () => {
    agentDao.createAgent(db, {
      id: "x",
      name: "X",
      type: "custom",
      enabled: true,
      protected: false,
    });
    expect(agentDao.getAgentById(db, "x")).toBeDefined();
    expect(agentDao.getAgentById(db, "x")!.name).toBe("X");
    expect(agentDao.getAgentById(db, "nonexistent")).toBeUndefined();
  });

  it("update partial fields", () => {
    agentDao.createAgent(db, {
      id: "u",
      name: "Old",
      type: "custom",
      enabled: true,
      protected: false,
      description: "desc",
    });
    agentDao.updateAgent(db, "u", { name: "New" });
    const updated = agentDao.getAgentById(db, "u")!;
    expect(updated.name).toBe("New");
    expect(updated.description).toBe("desc"); // unchanged
  });

  it("remove deletes agent", () => {
    agentDao.createAgent(db, {
      id: "del",
      name: "Del",
      type: "custom",
      enabled: true,
      protected: false,
    });
    agentDao.removeAgent(db, "del");
    expect(agentDao.getAgentById(db, "del")).toBeUndefined();
  });

  it("remove protected agent throws", () => {
    agentDao.createAgent(db, {
      id: "prot",
      name: "Protected",
      type: "builtin",
      enabled: true,
      protected: true,
    });
    expect(() => agentDao.removeAgent(db, "prot")).toThrow("Cannot delete protected agent");
  });

  it("ensureBuiltin is idempotent", () => {
    agentDao.ensureBuiltin(db);
    agentDao.ensureBuiltin(db);
    const list = db.prepare("SELECT * FROM agents WHERE id = 'hal-ai'").all();
    expect(list).toHaveLength(1);
    const hal = agentDao.getAgentById(db, "hal-ai")!;
    expect(hal.name).toBe("HalAI");
    expect(hal.type).toBe("builtin");
    expect(hal.protected).toBe(true);
    expect(hal.config).toEqual({ capabilityRequirements: ["chat"], subagentEnabled: false });
  });

  it("config_json and avatar_json serialization roundtrip", () => {
    agentDao.createAgent(db, {
      id: "json-test",
      name: "JSON",
      type: "custom",
      enabled: true,
      protected: false,
      avatar: { kind: "lucide", icon: "bot", color: "#ff0000" },
      config: {
        capabilityRequirements: ["reasoning"],
        systemPrompt: "You are helpful",
        temperature: 0.7,
        maxTokens: 4096,
        disabledTools: ["exec"],
        subagentEnabled: true,
      },
    });
    const agent = agentDao.getAgentById(db, "json-test")!;
    expect(agent.avatar).toEqual({ kind: "lucide", icon: "bot", color: "#ff0000" });
    expect(agent.config!.capabilityRequirements).toEqual(["reasoning"]);
    expect(agent.config!.temperature).toBe(0.7);
    expect(agent.config!.maxTokens).toBe(4096);
    expect(agent.config!.subagentEnabled).toBe(true);
  });

  it("enabled boolean conversion", () => {
    agentDao.createAgent(db, {
      id: "bool-test",
      name: "Bool",
      type: "custom",
      enabled: false,
      protected: false,
    });
    const agent = agentDao.getAgentById(db, "bool-test")!;
    expect(agent.enabled).toBe(false);
    expect(agent.protected).toBe(false);

    agentDao.updateAgent(db, "bool-test", { enabled: true });
    expect(agentDao.getAgentById(db, "bool-test")!.enabled).toBe(true);
  });
});
