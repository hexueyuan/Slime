import { getDb } from "@/db";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { SESSION_EVENTS } from "@shared/events";
import type { SessionRecord, ChatMessageRecord } from "@shared/types/agent";
import type { AgentChatPresenter } from "./agentChat/agentChatPresenter";

export class AgentChatPresenterAdapter {
  constructor(private engine: AgentChatPresenter) {}

  async createSession(agentId: string): Promise<SessionRecord> {
    const db = getDb();
    const id = crypto.randomUUID();

    sessionDao.createSession(db, {
      id,
      agentId,
      title: "新对话",
      sessionKind: "regular",
    });

    // Copy agent config to session config
    const agent = agentDao.getAgentById(db, agentId);
    const agentConfig = agent?.config;
    configDao.createConfig(db, {
      id,
      capabilityRequirements: agentConfig?.capabilityRequirements ?? ["chat"],
      systemPrompt: agentConfig?.systemPrompt ?? null,
      temperature: agentConfig?.temperature ?? null,
      contextLength: agentConfig?.contextLength ?? null,
      maxTokens: agentConfig?.maxTokens ?? null,
      thinkingBudget: agentConfig?.thinkingBudget ?? null,
    });

    const session = sessionDao.getSessionById(db, id)!;
    eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
    return session;
  }

  async getSessions(agentId?: string): Promise<SessionRecord[]> {
    const db = getDb();
    const all = sessionDao.listSessions(db, agentId);
    return all.filter((s) => s.sessionKind !== "subagent");
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const db = getDb();
    return sessionDao.getSessionById(db, sessionId) ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = getDb();
    sessionDao.deleteSession(db, sessionId);
    eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const db = getDb();
    sessionDao.updateTitle(db, sessionId, title);
    eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
  }

  async togglePin(sessionId: string): Promise<void> {
    const db = getDb();
    sessionDao.togglePin(db, sessionId);
    eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
  }

  async getMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    const db = getDb();
    return messageDao.listBySession(db, sessionId);
  }

  async chat(sessionId: string, content: string): Promise<void> {
    return this.engine.chat(sessionId, content);
  }

  stopGeneration(sessionId: string): void {
    this.engine.stopGeneration(sessionId);
  }

  async retryLastMessage(sessionId: string): Promise<void> {
    return this.engine.retryLastMessage(sessionId);
  }

  answerQuestion(sessionId: string, toolCallId: string, answer: string): void {
    this.engine.answerQuestion(sessionId, toolCallId, answer);
  }

  getSessionState(sessionId: string): "idle" | "generating" | "error" {
    return this.engine.getSessionState(sessionId);
  }
}
