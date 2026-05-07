import { getDb } from "@/db";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { eventBus } from "@/eventbus";
import { SESSION_EVENTS } from "@shared/events";
import type { SessionRecord, ChatMessageRecord, SessionMetadata } from "@shared/types/agent";
import type { AgentChatPresenter } from "./agentChat/agentChatPresenter";
import type { GatewayPresenter } from "./gatewayPresenter";
import { logger } from "@/utils";

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
    const agent = agentRegistry.getById(agentId);
    const agentConfig = agent?.config;
    configDao.createConfig(db, {
      id,
      capabilityRequirements: agentConfig?.capabilityRequirements ?? ["reasoning"],
      systemPrompt: null,
      temperature: null,
      contextLength: null,
      maxTokens: null,
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

    // Use "chat" group for title generation (simple text task, no special capability needed)
    // Fallback to session's capabilityRequirements if "chat" group is not configured
    let selectResult = this.gatewayPresenter.select(["chat"] as any);
    let groupName = selectResult.matched["chat"]?.groupName;
    if (!groupName) {
      const config = configDao.getConfigById(db, sessionId);
      const agent = agentRegistry.getById(session.agentId);
      const capReqs = (config?.capabilityRequirements ??
        agent?.config?.capabilityRequirements ?? ["reasoning"]) as any;
      selectResult = this.gatewayPresenter.select(capReqs);
      const firstCap = capReqs[0];
      const capKey = Array.isArray(firstCap) ? firstCap[0] : (firstCap ?? "reasoning");
      groupName = selectResult.matched[capKey]?.groupName;
    }
    if (!groupName) {
      logger.warn("[generateTitle] no model matched");
      return;
    }

    try {
      const port = this.gatewayPresenter.getPort();
      const apiKey = this.gatewayPresenter.getInternalKey();
      const prompt = `根据以下对话内容，生成一个简短的标题（不超过20字），只返回标题文本，不要加引号或其他格式：\n\n${allUserMessages.map((msg) => `用户：${msg}`).join("\n")}`;
      const resp = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: groupName,
          max_tokens: 50,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!resp.ok) {
        logger.warn("[generateTitle] request failed", { status: resp.status });
        return;
      }
      const data = (await resp.json()) as any;
      const textBlock = (data?.content as any[])?.find((b: any) => b.type === "text");
      const newTitle = (textBlock?.text ?? "").trim();
      if (newTitle) {
        sessionDao.updateTitle(db, sessionId, newTitle);
        metadata.titleGeneratedCount = (metadata.titleGeneratedCount ?? 0) + 1;
        sessionDao.updateMetadata(db, sessionId, metadata);
        eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null);
      }
    } catch (e) {
      logger.warn("[generateTitle] error", { err: String(e) });
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
