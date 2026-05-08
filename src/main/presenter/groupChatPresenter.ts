import { getDb } from "@/db";
import * as sessionDao from "@/db/models/groupChatSessionDao";
import * as messageDao from "@/db/models/groupChatMessageDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { agentInvokerRegistry } from "./agentChat/agentInvokerRegistry";
import { eventBus } from "@/eventbus";
import { GROUP_CHAT_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import type { GroupChatSession, GroupChatMessageRecord } from "@shared/types/groupChat";
import type { GatewayPresenter } from "./gatewayPresenter";

export class GroupChatPresenter {
  constructor(private gatewayPresenter: GatewayPresenter) {}

  async createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession> {
    const db = getDb();
    const id = crypto.randomUUID();
    const agentNames = participantAgentIds.map((aid) => agentRegistry.getById(aid)?.name ?? aid);
    const title = ["用户", ...agentNames].join("、");
    const session = sessionDao.createSession(db, {
      id,
      title,
      participantAgentIds,
      moderatorEnabled: moderatorEnabled ?? false,
    });
    return session;
  }

  async getSessions(): Promise<GroupChatSession[]> {
    const db = getDb();
    return sessionDao.listSessions(db);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = getDb();
    agentInvokerRegistry.stopAll(sessionId);
    sessionDao.deleteSession(db, sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const db = getDb();
    sessionDao.updateTitle(db, sessionId, title);
  }

  async getMessages(sessionId: string): Promise<GroupChatMessageRecord[]> {
    const db = getDb();
    return messageDao.listVisibleBySession(db, sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string,
    mentionedAgentIds: string[],
  ): Promise<void> {
    const db = getDb();
    const session = sessionDao.getSessionById(db, sessionId);
    if (!session) return;

    const userMsgId = crypto.randomUUID();
    const userMsg = messageDao.createMessage(db, {
      id: userMsgId,
      sessionId,
      senderAgentId: null,
      role: "user",
      content,
    });
    sessionDao.touchUpdatedAt(db, sessionId);
    eventBus.sendToRenderer(GROUP_CHAT_EVENTS.MESSAGE_ADDED, { sessionId, message: userMsg });

    const allMessages = messageDao.listBySession(db, sessionId);

    let targetAgentIds: string[] = mentionedAgentIds;

    if (targetAgentIds.length === 0 && session.moderatorEnabled) {
      targetAgentIds = await this.routeWithModerator(session, allMessages, content);
    }

    for (const agentId of targetAgentIds) {
      const invoker = agentInvokerRegistry.get(agentId);
      invoker.invoke({
        messages: allMessages,
        outputChannel: { type: "group_chat", sessionId },
      });
    }
  }

  async stopAgent(sessionId: string, agentId: string): Promise<void> {
    const invoker = agentInvokerRegistry.get(agentId);
    invoker.stop(sessionId);
  }

  private async routeWithModerator(
    session: GroupChatSession,
    recentMessages: GroupChatMessageRecord[],
    newContent: string,
  ): Promise<string[]> {
    const selectResult = this.gatewayPresenter.select(["chat"] as any);
    const groupName = selectResult.matched["chat"]?.groupName;
    if (!groupName) {
      return [];
    }

    const agentDescriptions = session.participantAgentIds
      .map((id) => {
        const agent = agentRegistry.getById(id);
        return `- ${id}: ${agent?.name ?? id}${agent?.description ? " — " + agent.description : ""}`;
      })
      .join("\n");

    const recentContext = recentMessages
      .filter((m) => !m.hidden)
      .slice(-20)
      .map((m) => {
        const sender = m.senderAgentId ?? "用户";
        return `${sender}: ${m.content.slice(0, 200)}`;
      })
      .join("\n");

    const prompt = `你是群聊路由助手。根据用户最新消息，判断应该由哪些 Agent 回复。

群聊参与 Agent：
${agentDescriptions}

最近消息：
${recentContext}

用户最新消息：${newContent}

请以 JSON 格式输出：{"targetAgentIds": ["agent-id-1"]}
只输出 JSON，不要其他内容。`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const port = this.gatewayPresenter.getPort();
      const apiKey = this.gatewayPresenter.getInternalKey();
      const resp = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: groupName,
          max_tokens: 100,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      clearTimeout(timeout);
      if (!resp.ok) return [];
      const data = (await resp.json()) as any;
      const textBlock = (data?.content as any[])?.find((b: any) => b.type === "text");
      const json = JSON.parse((textBlock?.text ?? "{}").trim()) as { targetAgentIds?: string[] };
      return (json.targetAgentIds ?? []).filter((id) => session.participantAgentIds.includes(id));
    } catch (err) {
      clearTimeout(timeout);
      logger.warn("[GroupChatPresenter] moderator routing failed", { err: String(err) });
      return [];
    }
  }
}
