import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getDb } from "@/db";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { SESSION_EVENTS } from "@shared/events";
import type { SessionRecord, ChatMessageRecord, SessionMetadata } from "@shared/types/agent";
import type { AgentChatPresenter } from "./agentChat/agentChatPresenter";
import type { GatewayPresenter } from "./gatewayPresenter";

export class AgentChatPresenterAdapter {
  constructor(
    private engine: AgentChatPresenter,
    private gatewayPresenter: GatewayPresenter,
  ) {}

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

  async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    const db = getDb();
    sessionDao.updateMetadata(db, sessionId, metadata as SessionMetadata);
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

  private async generateTitle(sessionId: string, content: string): Promise<void> {
    const db = getDb();
    const session = sessionDao.getSessionById(db, sessionId);
    if (!session) return;

    const metadata = session.metadata ?? {};
    if (metadata.titleManuallyEdited) return;
    if ((metadata.titleGeneratedCount ?? 0) >= 3) return;

    const existingMessages = messageDao
      .listBySession(db, sessionId)
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    const allUserMessages = [...existingMessages, content].slice(0, 3);

    const selectResult = this.gatewayPresenter.select(["chat"] as any);
    const groupName = selectResult.matched["chat"]?.groupName;
    if (!groupName) return;

    try {
      const provider = createAnthropic({
        apiKey: this.gatewayPresenter.getInternalKey(),
        baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}/v1/`,
      });
      const model = provider(groupName);

      const result = await generateText({
        model,
        prompt: `根据以下对话内容，生成一个简短的标题（不超过20字），只返回标题文本，不要加引号或其他格式：\n\n${allUserMessages.map((msg) => `用户：${msg}`).join("\n")}`,
        maxOutputTokens: 50,
        temperature: 0.7,
      });

      const newTitle = result.text.trim();
      if (newTitle) {
        sessionDao.updateTitle(db, sessionId, newTitle);
        metadata.titleGeneratedCount = (metadata.titleGeneratedCount ?? 0) + 1;
        sessionDao.updateMetadata(db, sessionId, metadata);
        eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
      }
    } catch {
      // Silently ignore
    }
  }

  async chat(sessionId: string, content: string): Promise<void> {
    this.generateTitle(sessionId, content).catch(() => {});
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
