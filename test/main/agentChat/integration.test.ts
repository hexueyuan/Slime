import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDb, closeDb, getDb } from "@/db";
import * as agentDao from "@/db/models/agentDao";
import * as messageDao from "@/db/models/agentMessageDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import type BetterSqlite3 from "better-sqlite3";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

import { eventBus } from "@/eventbus";
import { AgentChatPresenterAdapter } from "@/presenter/agentChatPresenterAdapter";
import { SESSION_EVENTS } from "@shared/events";

let db: BetterSqlite3.Database;

function makeMockEngine() {
  return {
    chat: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    retryLastMessage: vi.fn(async () => {}),
    answerQuestion: vi.fn(),
    getSessionState: vi.fn(() => "idle" as const),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  db = initDb(":memory:");
  agentDao.ensureBuiltin(db);
});

afterEach(() => {
  closeDb();
});

describe("AgentChatPresenter integration", () => {
  let adapter: AgentChatPresenterAdapter;
  let engine: ReturnType<typeof makeMockEngine>;

  beforeEach(() => {
    engine = makeMockEngine();
    adapter = new AgentChatPresenterAdapter(engine);
  });

  describe("session lifecycle", () => {
    it("createSession → getSessions → deleteSession", async () => {
      const session = await adapter.createSession("hal-ai");
      expect(session.id).toBeTruthy();
      expect(session.agentId).toBe("hal-ai");
      expect(session.title).toBe("新对话");

      const sessions = await adapter.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(session.id);

      // Session config created
      const config = configDao.getConfigById(db, session.id);
      expect(config).toBeDefined();
      expect(config!.capabilityRequirements).toEqual(["reasoning"]);

      await adapter.deleteSession(session.id);
      const afterDelete = await adapter.getSessions();
      expect(afterDelete).toHaveLength(0);

      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(SESSION_EVENTS.LIST_UPDATED, null);
    });

    it("getSession returns null for missing session", async () => {
      const result = await adapter.getSession("nonexistent");
      expect(result).toBeNull();
    });

    it("updateSessionTitle persists", async () => {
      const session = await adapter.createSession("hal-ai");
      await adapter.updateSessionTitle(session.id, "Renamed");
      const updated = await adapter.getSession(session.id);
      expect(updated!.title).toBe("Renamed");
    });

    it("togglePin flips isPinned", async () => {
      const session = await adapter.createSession("hal-ai");
      expect(session.isPinned).toBe(false);

      await adapter.togglePin(session.id);
      const pinned = await adapter.getSession(session.id);
      expect(pinned!.isPinned).toBe(true);

      await adapter.togglePin(session.id);
      const unpinned = await adapter.getSession(session.id);
      expect(unpinned!.isPinned).toBe(false);
    });

    it("filters out subagent sessions from getSessions", async () => {
      const regular = await adapter.createSession("hal-ai");

      // Manually insert a subagent session
      const { createSession } = await import("@/db/models/agentSessionDao");
      createSession(db, {
        id: "sub-1",
        agentId: "hal-ai",
        title: "subagent",
        sessionKind: "subagent",
        parentSessionId: regular.id,
      });

      const sessions = await adapter.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(regular.id);
    });
  });

  describe("session config copies agent config", () => {
    it("copies custom agent config to session config", async () => {
      agentDao.createAgent(db, {
        id: "custom-agent",
        name: "Custom",
        type: "custom",
        enabled: true,
        protected: false,
        config: {
          capabilityRequirements: ["reasoning", "chat"],
          systemPrompt: "Be concise",
          temperature: 0.3,
          maxTokens: 2048,
          subagentEnabled: false,
        },
      });

      const session = await adapter.createSession("custom-agent");
      const config = configDao.getConfigById(db, session.id)!;
      expect(config.capabilityRequirements).toEqual(["reasoning", "chat"]);
      expect(config.systemPrompt).toBe("Be concise");
      expect(config.temperature).toBe(0.3);
      expect(config.maxTokens).toBe(2048);
    });
  });

  describe("message persistence", () => {
    it("getMessages returns empty for new session", async () => {
      const session = await adapter.createSession("hal-ai");
      const msgs = await adapter.getMessages(session.id);
      expect(msgs).toHaveLength(0);
    });

    it("getMessages returns messages after manual insert", async () => {
      const session = await adapter.createSession("hal-ai");
      messageDao.createMessage(db, {
        id: "msg-1",
        sessionId: session.id,
        orderSeq: 1,
        role: "user",
        content: "hello",
        status: "sent",
      });
      messageDao.createMessage(db, {
        id: "msg-2",
        sessionId: session.id,
        orderSeq: 2,
        role: "assistant",
        content: '[{"type":"content","content":"hi","status":"success","timestamp":0}]',
        status: "sent",
      });

      const msgs = await adapter.getMessages(session.id);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe("user");
      expect(msgs[1].role).toBe("assistant");
    });
  });

  describe("engine delegation", () => {
    it("chat delegates to engine", async () => {
      await adapter.chat("sess-1", "hello");
      expect(engine.chat).toHaveBeenCalledWith("sess-1", "hello");
    });

    it("stopGeneration delegates", () => {
      adapter.stopGeneration("sess-1");
      expect(engine.stopGeneration).toHaveBeenCalledWith("sess-1");
    });

    it("retryLastMessage delegates", async () => {
      await adapter.retryLastMessage("sess-1");
      expect(engine.retryLastMessage).toHaveBeenCalledWith("sess-1");
    });

    it("answerQuestion delegates", () => {
      adapter.answerQuestion("sess-1", "tc-1", "yes");
      expect(engine.answerQuestion).toHaveBeenCalledWith("sess-1", "tc-1", "yes");
    });

    it("getSessionState delegates", () => {
      engine.getSessionState.mockReturnValue("generating");
      expect(adapter.getSessionState("sess-1")).toBe("generating");
    });
  });

  describe("deleteSession cascades", () => {
    it("deletes messages and config along with session", async () => {
      const session = await adapter.createSession("hal-ai");
      messageDao.createMessage(db, {
        id: "msg-del",
        sessionId: session.id,
        orderSeq: 1,
        role: "user",
        content: "test",
        status: "sent",
      });

      await adapter.deleteSession(session.id);

      expect(messageDao.listBySession(db, session.id)).toHaveLength(0);
      expect(configDao.getConfigById(db, session.id)).toBeUndefined();
    });
  });
});
