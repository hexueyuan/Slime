import type BetterSqlite3 from "better-sqlite3";
import * as messageDao from "@/db/models/agentMessageDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  ToolCallBlockData,
} from "@shared/types/agent";

export type CoreMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | Array<{ type: string; [key: string]: unknown }> }
  | {
      role: "tool";
      content: Array<{ type: string; toolCallId: string; toolName: string; output: unknown }>;
    };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildSkillListXML(skills: { name: string; description: string }[]): string | null {
  if (skills.length === 0) return null;
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return `<system-reminder>\nThe following skills are available for use with the Skill tool:\n${lines.join("\n")}\n</system-reminder>`;
}

export function recordToCoreMessages(records: ChatMessageRecord[]): CoreMessage[] {
  const messages: CoreMessage[] = [];

  for (const record of records) {
    if (record.role === "user") {
      if (record.content) {
        messages.push({ role: "user", content: record.content });
      }
      continue;
    }

    // assistant: parse content as AssistantMessageBlock[]
    let blocks: AssistantMessageBlock[];
    try {
      blocks = JSON.parse(record.content) as AssistantMessageBlock[];
    } catch {
      messages.push({ role: "assistant", content: record.content });
      continue;
    }

    const textParts = blocks.filter((b) => b.type === "content").map((b) => b.content || "");
    const textContent = textParts.join("");

    const thinkingBlocks = blocks.filter(
      (b): b is AssistantMessageBlock & { thinking: string; signature: string } =>
        b.type === "thinking" && b.thinking !== undefined,
    );

    const toolCalls = blocks.filter(
      (b): b is AssistantMessageBlock & { tool_call: ToolCallBlockData } =>
        b.type === "tool_call" && !!b.tool_call,
    );

    if (toolCalls.length === 0 && thinkingBlocks.length === 0) {
      if (textContent) {
        messages.push({ role: "assistant", content: textContent });
      }
    } else {
      // assistant message: array of text + thinking + tool-call parts
      const assistantParts: Array<{ type: string; [key: string]: unknown }> = [];
      if (textContent) assistantParts.push({ type: "text", text: textContent });
      for (const b of thinkingBlocks) {
        assistantParts.push({
          type: "thinking",
          thinking: b.thinking,
          signature: b.signature ?? "",
        });
      }
      for (const b of toolCalls) {
        const tc = b.tool_call;
        const input = typeof tc.input === "string" ? JSON.parse(tc.input) : (tc.input ?? {});
        assistantParts.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.name,
          input,
        });
      }
      messages.push({ role: "assistant", content: assistantParts });

      // tool results: array of tool-result parts
      const toolResultParts = toolCalls.map((b) => {
        const tc = b.tool_call;
        const output =
          tc.output != null
            ? typeof tc.output === "string"
              ? tc.output
              : JSON.stringify(tc.output)
            : "";
        return {
          type: "tool-result",
          toolCallId: tc.id,
          toolName: tc.name,
          output: { type: "text", value: output },
        };
      });
      messages.push({ role: "tool", content: toolResultParts });
    }
  }

  return messages;
}

export function selectTurnHistory(messages: CoreMessage[], availableTokens: number): CoreMessage[] {
  if (availableTokens <= 0) return [];

  // Walk backwards, accumulate tokens, keep user/assistant pairs intact
  let tokens = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const raw = "content" in msg ? msg.content : "";
    const contentStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    const msgTokens = estimateTokens(contentStr);

    if (tokens + msgTokens > availableTokens) {
      // If this is an assistant message paired with the next user message,
      // don't include partial pair
      cutIndex = i + 1;
      break;
    }
    tokens += msgTokens;
    cutIndex = i;
  }

  // Ensure we don't start mid-turn: first message should be user or tool
  while (cutIndex < messages.length) {
    const first = messages[cutIndex];
    if (first.role === "user" || first.role === "tool") break;
    cutIndex++;
  }

  return messages.slice(cutIndex);
}

export function buildContext(
  sessionId: string,
  newUserContent: string,
  db: BetterSqlite3.Database,
  options?: { reserveTokens?: number; agentSystemPrompt?: string; skillListXML?: string | null },
): CoreMessage[] {
  const reserve = options?.reserveTokens ?? 4096;
  const config = configDao.getConfigById(db, sessionId);
  const contextLength = config?.contextLength ?? 128000;

  const systemPrompt =
    config?.systemPrompt || options?.agentSystemPrompt || "You are a helpful AI assistant.";
  const finalSystemPrompt = options?.skillListXML
    ? systemPrompt + "\n\n" + options.skillListXML
    : systemPrompt;
  const systemMsg: CoreMessage = { role: "system", content: finalSystemPrompt };

  const allMessages = messageDao.listBySession(db, sessionId);
  const cursor = config?.summaryCursorSeq ?? 0;
  const sentMessages = allMessages.filter((m) => m.status === "sent" && m.orderSeq > cursor);

  const historyMessages = recordToCoreMessages(sentMessages);

  // Guard: if the last history message is the same user content as newUserContent,
  // remove it to avoid duplication (can happen if caller writes user msg to DB before calling buildContext)
  if (
    historyMessages.length > 0 &&
    historyMessages[historyMessages.length - 1].role === "user" &&
    (historyMessages[historyMessages.length - 1] as { role: "user"; content: string }).content ===
      newUserContent
  ) {
    historyMessages.pop();
  }

  const systemTokens = estimateTokens(finalSystemPrompt);
  const newUserTokens = estimateTokens(newUserContent);
  let summaryTokens = 0;
  const summaryMessages: CoreMessage[] = [];
  if (config?.summaryText) {
    const summaryContent = `Previous conversation summary:\n${config.summaryText}`;
    summaryTokens = estimateTokens(summaryContent);
    summaryMessages.push({ role: "system", content: summaryContent });
  }
  const available = contextLength - systemTokens - newUserTokens - summaryTokens - reserve;

  const trimmed = selectTurnHistory(historyMessages, available);

  // Drop messages with empty content (Anthropic rejects them)
  const filtered = trimmed.filter((m) => {
    const c = "content" in m ? (m as { content: unknown }).content : undefined;
    if (typeof c === "string") return c.length > 0;
    if (Array.isArray(c)) return c.length > 0;
    return c != null;
  });

  const newUserMsg: CoreMessage = { role: "user", content: newUserContent };
  return [systemMsg, ...summaryMessages, ...filtered, newUserMsg];
}
