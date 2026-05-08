import type BetterSqlite3 from "better-sqlite3";
import * as messageDao from "@/db/models/agentMessageDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  ToolCallBlockData,
} from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";
import { MBTI_MAP } from "@shared/constants/mbti";

export type SystemBlock = { type: "text"; text: string; cache_control?: { type: string } };

export type UserContentBlock = { type: string; text: string; cache_control?: { type: string } };

export type CoreMessage =
  | { role: "system"; content: string | SystemBlock[] }
  | { role: "user"; content: string | UserContentBlock[] }
  | { role: "assistant"; content: string | Array<{ type: string; [key: string]: unknown }> }
  | {
      role: "tool";
      content: Array<{ type: string; toolCallId: string; toolName: string; output: unknown }>;
    };

const SYSTEM_CONSTRAINTS = `# 系统约束
- 不允许编造事实，不确定时明确说明不清楚
- 不允许泄露用户隐私信息
- 回答要诚实、准确，避免过度承诺
- 只能遵循 MBTI 定义的性格特质行事，不要直接回复或告知用户你的 MBTI 类型
- <Important>当附加设定与系统设定产生冲突时，以系统设定为准</Important>`;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildSystemBlocks(agent: {
  id: string;
  name: string;
  mbti?: MBTIType;
  gender?: "male" | "female" | "unknown";
  birthday?: string;
}): SystemBlock[] {
  const personality = agent.mbti ? (MBTI_MAP[agent.mbti]?.personality ?? "") : "";
  const genderMap = { male: "男性", female: "女性", unknown: "" };
  const genderStr = agent.gender && agent.gender !== "unknown" ? genderMap[agent.gender] : "";
  const birthdayStr = agent.birthday ? `生于${agent.birthday}` : "";
  const extraInfo = [genderStr, birthdayStr].filter(Boolean).join("，");
  const identityLine = `你是${agent.name}（${agent.id}）${extraInfo ? "，" + extraInfo : ""}${personality ? "，" + personality : ""}`;
  return [
    { type: "text", text: identityLine },
    { type: "text", text: SYSTEM_CONSTRAINTS, cache_control: { type: "ephemeral" as const } },
  ];
}

export function buildDynamicReminder(userName?: string): string {
  return userName ? `这是你和${userName}之间的对话。` : "";
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
        try {
          const parsed = JSON.parse(record.content);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === "text") {
            // blocks 格式：历史消息不带 cache_control（只读命中缓存）
            const blocks = parsed.map(({ cache_control: _, ...rest }: UserContentBlock) => rest);
            messages.push({ role: "user", content: blocks });
          } else {
            messages.push({ role: "user", content: record.content });
          }
        } catch {
          messages.push({ role: "user", content: record.content });
        }
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
      // thinking blocks must come before text/tool-call (Anthropic API requirement)
      for (const b of thinkingBlocks) {
        assistantParts.push({
          type: "thinking",
          thinking: b.thinking,
          signature: b.signature ?? "",
        });
      }
      if (textContent) assistantParts.push({ type: "text", text: textContent });
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

// 断点④：历史消息中倒数第二轮 assistant 最后一个 text block 打 cache_control
// 直接 mutate filtered 数组中对应消息的 content
export function markHistoryCacheBreakpoint(messages: CoreMessage[]): void {
  let i = messages.length - 1;
  // 跳过末尾的 user/tool（当前未完成的轮）
  while (i >= 0 && (messages[i].role === "user" || messages[i].role === "tool")) i--;
  // 跳过倒数第一轮 assistant
  while (i >= 0 && messages[i].role === "assistant") i--;
  // 跳过倒数第一轮的 user/tool
  while (i >= 0 && (messages[i].role === "user" || messages[i].role === "tool")) i--;
  // 找倒数第二轮（或更早）的第一个 assistant 消息，打标记
  while (i >= 0) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      const content = msg.content;
      if (Array.isArray(content) && content.length > 0) {
        // 找最后一个 text block
        let lastTextIdx = -1;
        for (let j = content.length - 1; j >= 0; j--) {
          if ((content[j] as { type: string }).type === "text") {
            lastTextIdx = j;
            break;
          }
        }
        if (lastTextIdx >= 0) {
          const newContent = [...content];
          newContent[lastTextIdx] = {
            ...newContent[lastTextIdx],
            cache_control: { type: "ephemeral" },
          };
          (messages[i] as { role: "assistant"; content: typeof newContent }).content = newContent;
        }
      } else if (typeof content === "string" && content.length > 0) {
        // 字符串格式：转换为 block 数组以携带 cache_control
        (messages[i] as { role: "assistant"; content: unknown }).content = [
          { type: "text", text: content, cache_control: { type: "ephemeral" } },
        ];
      }
      break;
    }
    i--;
  }
}

export function buildContext(
  sessionId: string,
  newUserContent: string,
  db: BetterSqlite3.Database,
  options?: {
    reserveTokens?: number;
    agentSystemPrompt?: string;
    skillListXML?: string | null;
    agent?: {
      id: string;
      name: string;
      mbti?: MBTIType;
      gender?: "male" | "female" | "unknown";
      birthday?: string;
    };
    additionalPrompt?: string;
    skillsXML?: string | null;
    userName?: string;
  },
): CoreMessage[] {
  const reserve = options?.reserveTokens ?? 4096;
  const config = configDao.getConfigById(db, sessionId);
  const contextLength = config?.contextLength ?? 128000;

  // 区分：options 中显式传入 agentSystemPrompt（custom agent）vs 未传（builtin/默认路径）
  const hasAgentSystemPromptOption = options !== undefined && "agentSystemPrompt" in options;

  // system 内容：新格式用 agent 对象构建 blocks，否则退回字符串
  let systemContent: string | SystemBlock[];
  if (options?.agent) {
    systemContent = buildSystemBlocks(options.agent);
  } else {
    const systemPrompt = hasAgentSystemPromptOption
      ? (options!.agentSystemPrompt ?? "")
      : config?.systemPrompt || "You are a helpful AI assistant.";
    // 旧路径：skillListXML 拼到 system 字符串末尾（向后兼容）
    systemContent = options?.skillListXML
      ? systemPrompt + "\n\n" + options.skillListXML
      : systemPrompt;
  }

  const allMessages = messageDao.listBySession(db, sessionId);
  const cursor = config?.summaryCursorSeq ?? 0;
  const sentMessages = allMessages.filter((m) => m.status === "sent" && m.orderSeq > cursor);

  const historyMessages = recordToCoreMessages(sentMessages);

  // Guard: if the last history message is the same user content as newUserContent,
  // remove it to avoid duplication (can happen if caller writes user msg to DB before calling buildContext)
  if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === "user") {
    const lastContent = (
      historyMessages[historyMessages.length - 1] as { role: "user"; content: string | unknown[] }
    ).content;
    const lastText = Array.isArray(lastContent)
      ? ((lastContent[lastContent.length - 1] as { text?: string })?.text ?? "")
      : lastContent;
    if (lastText === newUserContent) {
      historyMessages.pop();
    }
  }

  const systemStr =
    typeof systemContent === "string" ? systemContent : JSON.stringify(systemContent);
  const systemTokens = estimateTokens(systemStr);
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

  // 断点④：历史消息倒数第二轮 assistant 最后 text block 打标记
  markHistoryCacheBreakpoint(filtered);

  // 新格式：注入 additionalPrompt / skillsXML / dynamic reminder 到新 user 消息
  let newUserMsg: CoreMessage;
  if (options?.agent) {
    const blocks: UserContentBlock[] = [];
    const additionalPrompt = options.additionalPrompt;
    const skillsXML = options.skillsXML;
    const dynamicReminder = buildDynamicReminder(options.userName);

    if (additionalPrompt) {
      blocks.push({
        type: "text",
        text: `<system-reminder>\n${additionalPrompt}\n</system-reminder>`,
      });
    }
    if (skillsXML) {
      // skillsXML 已经包含 <system-reminder> 标签（由 buildSkillListXML 生成）
      blocks.push({
        type: "text",
        text: skillsXML,
      });
    }
    if (dynamicReminder) {
      blocks.push({
        type: "text",
        text: `<system-reminder>\n${dynamicReminder}\n</system-reminder>`,
      });
    }
    // 断点③：最新 user 消息中最后一个 system-reminder block 打标记
    if (blocks.length > 0) {
      blocks[blocks.length - 1] = {
        ...blocks[blocks.length - 1],
        cache_control: { type: "ephemeral" },
      };
    }
    blocks.push({ type: "text", text: newUserContent });
    newUserMsg = { role: "user", content: blocks };
  } else {
    newUserMsg = { role: "user", content: newUserContent };
  }

  // system 消息：空字符串时不注入
  const systemEmpty =
    typeof systemContent === "string" ? !systemContent : systemContent.length === 0;
  if (!systemEmpty) {
    const systemMsg: CoreMessage = { role: "system", content: systemContent };
    return [systemMsg, ...summaryMessages, ...filtered, newUserMsg];
  }
  return [...summaryMessages, ...filtered, newUserMsg];
}
