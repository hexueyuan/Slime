import { getDb } from "@/db";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import { logger } from "@/utils";
import type { AgentChatPresenter } from "./agentChatPresenter";

const SUBAGENT_TIMEOUT = 5 * 60 * 1000;

export class SubagentPresenter {
  constructor(private chatPresenter: AgentChatPresenter) {}

  async fork(parentSessionId: string, mode: "inherit" | "new", prompt: string): Promise<string> {
    const db = getDb();
    const parentSession = sessionDao.getSessionById(db, parentSessionId);
    if (!parentSession) throw new Error("Parent session not found");

    if (parentSession.sessionKind === "subagent") {
      throw new Error("Recursive subagent fork is not allowed (max depth 1)");
    }

    const childSessionId = crypto.randomUUID();

    sessionDao.createSession(db, {
      id: childSessionId,
      agentId: parentSession.agentId,
      title: `subagent: ${prompt.slice(0, 50)}`,
      sessionKind: "subagent",
      parentSessionId,
      subagentMeta: { mode, prompt, parentSessionId },
    });

    const parentConfig = configDao.getConfigById(db, parentSessionId);
    configDao.createConfig(db, {
      id: childSessionId,
      capabilityRequirements: parentConfig?.capabilityRequirements ?? ["chat"],
      systemPrompt: parentConfig?.systemPrompt ?? null,
      temperature: parentConfig?.temperature ?? null,
      contextLength: parentConfig?.contextLength ?? null,
      maxTokens: parentConfig?.maxTokens ?? null,
      thinkingBudget: parentConfig?.thinkingBudget ?? null,
    });

    if (mode === "inherit" && parentConfig?.summaryText) {
      configDao.updateConfig(db, childSessionId, {
        summaryText: parentConfig.summaryText,
      });
    }

    try {
      await Promise.race([
        this.chatPresenter.chat(childSessionId, prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Subagent timeout (5 minutes)")), SUBAGENT_TIMEOUT),
        ),
      ]);

      const messages = messageDao.listBySession(db, childSessionId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) {
        try {
          const blocks = JSON.parse(lastAssistant.content);
          const textParts = blocks
            .filter((b: any) => b.type === "content")
            .map((b: any) => b.content || "");
          return textParts.join("") || lastAssistant.content;
        } catch {
          return lastAssistant.content;
        }
      }
      return "[Subagent completed with no response]";
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Subagent fork failed", { parentSessionId, mode, error: errorMsg });
      this.chatPresenter.stopGeneration(childSessionId);
      return `[Subagent error: ${errorMsg}]`;
    }
  }
}
