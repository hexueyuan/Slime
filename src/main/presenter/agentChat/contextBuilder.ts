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
  | { role: "assistant"; content: string }
  | { role: "tool"; content: string; toolCallId: string };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function recordToCoreMessages(records: ChatMessageRecord[]): CoreMessage[] {
  const messages: CoreMessage[] = [];

  for (const record of records) {
    if (record.role === "user") {
      messages.push({ role: "user", content: record.content });
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

    const toolCalls = blocks.filter(
      (b): b is AssistantMessageBlock & { tool_call: ToolCallBlockData } =>
        b.type === "tool_call" && !!b.tool_call,
    );

    if (toolCalls.length === 0) {
      if (textContent) {
        messages.push({ role: "assistant", content: textContent });
      }
    } else {
      // assistant text + tool call info as text
      let assistantText = textContent;
      for (const b of toolCalls) {
        const tc = b.tool_call;
        const inputStr = typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input);
        assistantText += `\n[Tool call: ${tc.name}(${inputStr})]`;
      }
      messages.push({ role: "assistant", content: assistantText });

      // tool results
      for (const b of toolCalls) {
        const tc = b.tool_call;
        const output =
          tc.output != null
            ? typeof tc.output === "string"
              ? tc.output
              : JSON.stringify(tc.output)
            : "";
        messages.push({ role: "tool", content: output, toolCallId: tc.id });
      }
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
    const content = "content" in msg ? msg.content : "";
    const msgTokens = estimateTokens(content);

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
  options?: { reserveTokens?: number },
): CoreMessage[] {
  const reserve = options?.reserveTokens ?? 4096;
  const config = configDao.getConfigById(db, sessionId);
  const contextLength = config?.contextLength ?? 128000;

  const systemPrompt = config?.systemPrompt || "You are a helpful AI assistant.";
  const systemMsg: CoreMessage = { role: "system", content: systemPrompt };

  const allMessages = messageDao.listBySession(db, sessionId);
  const cursor = config?.summaryCursorSeq ?? 0;
  const sentMessages = allMessages.filter((m) => m.status === "sent" && m.orderSeq > cursor);

  const historyMessages = recordToCoreMessages(sentMessages);

  const systemTokens = estimateTokens(systemPrompt);
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

  const newUserMsg: CoreMessage = { role: "user", content: newUserContent };
  return [systemMsg, ...summaryMessages, ...trimmed, newUserMsg];
}
