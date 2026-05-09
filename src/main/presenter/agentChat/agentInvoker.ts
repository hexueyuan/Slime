import { z } from "zod";
import { homedir } from "os";
import { getDb } from "@/db";
import * as groupMsgDao from "@/db/models/groupChatMessageDao";
import * as groupSessionDao from "@/db/models/groupChatSessionDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { eventBus } from "@/eventbus";
import { GROUP_CHAT_EVENTS } from "@shared/events";
import { logger, paths } from "@/utils";
import { buildSystemBlocks, buildSkillListXML } from "./contextBuilder";
import { createLLMClient } from "@/llm";
import type { Tool } from "@/llm";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { CoreMessage, SystemBlock } from "./contextBuilder";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";
import type { ConfigPresenter } from "../configPresenter";
import type { AgentConfigPresenter } from "../agentConfigPresenter";
import type { SkillPresenter } from "../skillPresenter";

export function estimateMessagesTokens(messages: CoreMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    const c = msg.content;
    if (typeof c === "string") {
      total += Math.ceil(c.length / 4);
    } else if (Array.isArray(c)) {
      for (const block of c as Array<{ type: string; [key: string]: unknown }>) {
        const str =
          block.type === "tool-result"
            ? JSON.stringify((block as { output?: unknown }).output ?? "")
            : JSON.stringify(block);
        total += Math.ceil(str.length / 4);
      }
    }
  }
  return total;
}

const MAX_STEPS = 128;

interface InvokeParams {
  messages: GroupChatMessageRecord[];
  outputChannel: { type: "group_chat"; sessionId: string };
  hidden?: boolean;
}

export class AgentInvoker {
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private agentId: string,
    private gatewayPresenter: GatewayPresenter,
    private toolPresenter: ToolPresenter,
    private configPresenter: ConfigPresenter,
    private agentConfigPresenter: AgentConfigPresenter,
    private skillPresenter: SkillPresenter,
  ) {}

  isRunning(sessionId: string): boolean {
    return this.abortControllers.has(sessionId);
  }

  stop(sessionId: string): void {
    const ctrl = this.abortControllers.get(sessionId);
    if (ctrl) {
      ctrl.abort();
      // 不在这里 delete，由 _run() 的 finally 统一清理
    }
  }

  invoke(params: InvokeParams): void {
    this._run(params).catch((err) => {
      logger.error("[AgentInvoker] invoke error", { agentId: this.agentId, err: String(err) });
    });
  }

  private buildLLMMessages(
    agentId: string,
    groupMessages: GroupChatMessageRecord[],
    agent: {
      id: string;
      name: string;
      mbti?: string;
      gender?: "male" | "female" | "unknown";
      birthday?: string;
    },
    participantAgentIds: string[],
    additionalPrompt?: string,
    skillsXML?: string | null,
    userName?: string,
    sessionId?: string,
  ): CoreMessage[] {
    // System blocks: identity + constraints (不含群聊上下文，群聊上下文放到 user 消息里)
    const systemBlocks: SystemBlock[] = buildSystemBlocks(
      agent as Parameters<typeof buildSystemBlocks>[0],
    );

    const messages: CoreMessage[] = [{ role: "system", content: systemBlocks }];

    // 在历史消息之前注入 system-reminder blocks（additionalPrompt / skills / 群聊环境）
    // 格式与单聊一致：每个 block 是独立的 { type: "text", text: "..." } 对象，组成 content 数组
    const reminderContentBlocks: Array<{ type: "text"; text: string }> = [];
    if (additionalPrompt) {
      reminderContentBlocks.push({
        type: "text",
        text: `<system-reminder>\n${additionalPrompt}\n</system-reminder>`,
      });
    }
    if (skillsXML) {
      // skillsXML 已由 buildSkillListXML 包含 <system-reminder> 标签
      reminderContentBlocks.push({ type: "text", text: skillsXML });
    }

    // 群聊环境信息：参与者列表 + 用户名
    const otherIds = participantAgentIds.filter((id) => id !== agentId);
    const otherParticipants =
      otherIds.length > 0 ? `群聊中的其他参与者 ID 为：[${otherIds.join(", ")}]。` : "";
    const userInfo = userName ? `当前用户名：${userName}。` : "";
    const sessionLine = sessionId ? `\n当前群聊ID：${sessionId}` : "";
    const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}

群聊行为规则：
1. 本轮用户消息是历史中最后一条 [用户] 消息，你只需要回答这条消息，不要主动评论或引用之前轮次的内容，除非用户明确提到了历史内容。
2. 如果用户问题涉及多个参与者（例如"你们几个的 X 是什么"），你只回答属于你自己的部分，不猜测、不评论其他参与者，也不要提及其他参与者会如何回答或需要他们自己来答——其他参与者会自行回复，无需你代为说明。
3. 历史消息仅供理解对话背景，不是你需要逐一回应的内容。${sessionLine}`;
    reminderContentBlocks.push({
      type: "text",
      text: `<system-reminder>\n${groupContext}\n</system-reminder>`,
    });

    // 第一条 user 消息包含所有 reminder blocks（数组格式，与单聊一致）
    messages.push({ role: "user", content: reminderContentBlocks });
    messages.push({ role: "assistant", content: "好的，我已了解当前环境和设定。" });

    // 转换群聊历史消息，维护轮次计数器
    let roundIndex = 0;
    for (const msg of groupMessages) {
      if (msg.hidden) {
        // hidden 消息（如主持人指令）不计入轮次，不加前缀
        messages.push({ role: "user", content: msg.content });
      } else if (msg.senderAgentId === null) {
        roundIndex++;
        messages.push({ role: "user", content: `[Round ${roundIndex}] ${msg.content}` });
      } else if (msg.senderAgentId === agentId) {
        let textContent = msg.content;
        try {
          const blocks = JSON.parse(msg.content) as AssistantMessageBlock[];
          const text = blocks
            .filter((b) => b.type === "content" && b.content)
            .map((b) => b.content ?? "")
            .join("");
          if (text) textContent = text;
        } catch {
          // not JSON, use as-is
        }
        messages.push({ role: "assistant", content: `[Round ${roundIndex}] ${textContent}` });
      } else {
        let textContent = msg.content;
        try {
          const blocks = JSON.parse(msg.content) as AssistantMessageBlock[];
          const text = blocks
            .filter((b) => b.type === "content" && b.content)
            .map((b) => b.content ?? "")
            .join("");
          if (text) textContent = text;
        } catch {
          // not JSON, use as-is
        }
        messages.push({
          role: "user",
          content: `[Round ${roundIndex}] [${msg.senderAgentId}]: ${textContent}`,
        });
      }
    }

    return messages;
  }

  private async _run(params: InvokeParams): Promise<void> {
    const { outputChannel, hidden } = params;
    const { sessionId } = outputChannel;

    if (this.abortControllers.has(sessionId)) return;

    const db = getDb();
    const session = groupSessionDao.getSessionById(db, sessionId);
    if (!session) return;

    const agent = agentRegistry.getById(this.agentId);
    if (!agent) return;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
      sessionId,
      agentId: this.agentId,
      isTyping: true,
    });

    const capReqs = (agent.config?.capabilityRequirements ?? ["reasoning"]) as Parameters<
      GatewayPresenter["select"]
    >[0];
    const selectResult = this.gatewayPresenter.select(capReqs);
    const firstCap = Array.isArray(capReqs) ? capReqs[0] : capReqs;
    const capKey = Array.isArray(firstCap) ? firstCap[0] : (firstCap ?? "reasoning");
    const groupName = (selectResult.matched as Record<string, { groupName: string } | undefined>)[
      capKey as string
    ]?.groupName;
    if (!groupName) {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
        sessionId,
        agentId: this.agentId,
        isTyping: false,
      });
      return;
    }

    const client = createLLMClient("anthropic", {
      baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}`,
      apiKey: this.gatewayPresenter.getInternalKey(),
    });

    const enabledTools = agent.config?.enabledTools ?? [];
    const sessionWorkDir = paths.sessionWorkDir(sessionId);
    const agentTrustedPaths = (agent.config?.trustedPaths ?? []).map((p) =>
      p.startsWith("~") ? p.replace("~", homedir()) : p,
    );
    const groupWorkspacePaths = session.workspacePaths ?? [];
    const trustedPaths = [sessionWorkDir, ...agentTrustedPaths, ...groupWorkspacePaths];
    this.toolPresenter.setSessionContext(
      sessionId,
      this.agentId,
      agent.type ?? "custom",
      agent.config?.allowedCliCommands,
      trustedPaths,
    );
    const allTools = await this.toolPresenter.getToolSet(sessionId);
    const filteredTools =
      enabledTools.length > 0
        ? Object.fromEntries(Object.entries(allTools).filter(([k]) => enabledTools.includes(k)))
        : {};
    const tools: Record<string, Tool> = {};
    for (const [name, t] of Object.entries(filteredTools)) {
      const raw = t as { description?: string; inputSchema?: unknown };
      const jsonSchema = raw.inputSchema
        ? z.toJSONSchema(raw.inputSchema as Parameters<typeof z.toJSONSchema>[0])
        : { type: "object", properties: {} };
      tools[name] = {
        description: raw.description,
        parameters: jsonSchema as Record<string, unknown>,
      };
    }

    // 读取 additionalPrompt / skills / userName
    const additionalPromptFromConfig = agent.config?.additionalPrompt ?? "";
    const promptFromFile = !additionalPromptFromConfig
      ? await this.agentConfigPresenter.readPromptMd(this.agentId)
      : "";
    const additionalPrompt = additionalPromptFromConfig || promptFromFile || undefined;

    const skillsXML = buildSkillListXML(
      this.skillPresenter.getSkillList(this.agentId, undefined, agent.config?.enabledSkills ?? []),
    );

    const profile = (await this.configPresenter.get("app.userProfile")) as
      | { name?: string }
      | null
      | undefined;
    const userName = profile?.name ?? undefined;

    const llmMessages = this.buildLLMMessages(
      this.agentId,
      params.messages,
      {
        id: agent.id,
        name: agent.name,
        mbti: agent.mbti as string | undefined,
        gender: agent.gender,
        birthday: agent.birthday,
      },
      session.participantAgentIds,
      additionalPrompt,
      skillsXML,
      userName,
      sessionId,
    );

    let lastInputTokens = 0;
    const blocks: AssistantMessageBlock[] = [];
    let stepCount = 0;

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const stream = client.chat(
          llmMessages,
          tools,
          {
            model: groupName,
            maxTokens: agent.config?.enableThinking
              ? (agent.config?.maxTokens ?? 32768)
              : (agent.config?.maxTokens ?? undefined),
            thinkingBudget: agent.config?.enableThinking ? 10000 : undefined,
          },
          abortController.signal,
        );

        let textContent = "";
        const toolCalls: Array<{ id: string; name: string; args: string }> = [];
        const pendingTCs = new Map<string, { id: string; name: string; inputJson: string }>();

        for await (const event of stream) {
          if (abortController.signal.aborted) break;
          if (event.type === "text") {
            textContent += event.text;
            const lastContent = [...blocks].reverse().find((b) => b.type === "content");
            if (lastContent) {
              lastContent.content = (lastContent.content ?? "") + event.text;
            } else {
              blocks.push({
                type: "content",
                content: event.text,
                status: "loading",
                timestamp: Date.now(),
              });
            }
          } else if (event.type === "tool_call_start") {
            pendingTCs.set(event.id, { id: event.id, name: event.name, inputJson: "" });
          } else if (event.type === "tool_call_delta") {
            const tc = pendingTCs.get(event.id);
            if (tc) tc.inputJson += event.delta;
          } else if (event.type === "tool_call_end") {
            const tc = pendingTCs.get(event.id);
            if (tc) {
              let argsObj: unknown;
              try {
                argsObj = event.input ?? JSON.parse(tc.inputJson || "{}");
              } catch {
                argsObj = {};
              }
              toolCalls.push({ id: tc.id, name: tc.name, args: JSON.stringify(argsObj) });
              blocks.push({
                type: "tool_call",
                id: tc.id,
                content: "",
                status: "loading",
                timestamp: Date.now(),
                tool_call: { id: tc.id, name: tc.name, input: argsObj },
              });
              pendingTCs.delete(event.id);
            }
          } else if (event.type === "thinking_start") {
            blocks.push({
              type: "thinking",
              thinking: "",
              signature: "",
              status: "loading",
              timestamp: Date.now(),
            });
          } else if (event.type === "thinking_delta") {
            const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
            if (lastThinking && lastThinking.thinking !== undefined) {
              lastThinking.thinking += event.text;
            }
          } else if (event.type === "signature_delta") {
            const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
            if (lastThinking && lastThinking.signature !== undefined) {
              lastThinking.signature += event.signature;
            }
          } else if (event.type === "thinking_end") {
            const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
            if (lastThinking) {
              lastThinking.thinking = event.thinking;
              lastThinking.signature = event.signature;
              lastThinking.status = "success";
            }
          } else if (event.type === "error") {
            throw new Error(event.error);
          } else if (event.type === "usage") {
            lastInputTokens = event.usage.inputTokens;
          }
        }

        if (toolCalls.length === 0) break;

        const assistantParts: Array<{ type: string; [key: string]: unknown }> = [];
        // thinking blocks must come before text/tool-call (Anthropic API requirement)
        for (const b of blocks) {
          if (b.type === "thinking" && b.thinking !== undefined) {
            assistantParts.push({
              type: "thinking",
              thinking: b.thinking,
              signature: b.signature ?? "",
            });
          }
        }
        if (textContent) assistantParts.push({ type: "text", text: textContent });
        for (const tc of toolCalls) {
          assistantParts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.name,
            input: JSON.parse(tc.args) as unknown,
          });
        }
        llmMessages.push({ role: "assistant", content: assistantParts });

        const toolResultParts: Array<{
          type: string;
          toolCallId: string;
          toolName: string;
          output: unknown;
        }> = [];
        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;
          try {
            const result = await this.toolPresenter.callTool(
              sessionId,
              tc.name,
              JSON.parse(tc.args) as Record<string, unknown>,
            );
            const block = blocks.find((b) => b.type === "tool_call" && b.id === tc.id);
            if (block && block.tool_call) {
              block.status = "success";
              block.tool_call.output = result;
            }
            const rawValue = typeof result === "string" ? result : JSON.stringify(result);
            const MAX_TOOL_RESULT = 20000;
            const value =
              rawValue.length > MAX_TOOL_RESULT
                ? rawValue.slice(0, MAX_TOOL_RESULT) +
                  `\n\n[truncated: ${rawValue.length - MAX_TOOL_RESULT} chars omitted]`
                : rawValue;
            toolResultParts.push({
              type: "tool-result",
              toolCallId: tc.id,
              toolName: tc.name,
              output: { type: "text", value },
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const block = blocks.find((b) => b.type === "tool_call" && b.id === tc.id);
            if (block && block.tool_call) {
              block.status = "error";
              block.tool_call.output = `Error: ${errMsg}`;
            }
            toolResultParts.push({
              type: "tool-result",
              toolCallId: tc.id,
              toolName: tc.name,
              output: { type: "text", value: `Error: ${errMsg}` },
            });
          }
        }
        llmMessages.push({ role: "tool", content: toolResultParts });
      }

      for (const b of blocks) if (b.status === "loading") b.status = "success";

      if (blocks.length > 0 || !abortController.signal.aborted) {
        const msgId = crypto.randomUUID();
        const msg = groupMsgDao.createMessage(db, {
          id: msgId,
          sessionId,
          senderAgentId: this.agentId,
          role: "assistant",
          content: JSON.stringify(blocks),
          hidden: hidden ?? false,
        });

        groupSessionDao.touchUpdatedAt(db, sessionId);

        if (!hidden) {
          eventBus.sendToRenderer(GROUP_CHAT_EVENTS.MESSAGE_ADDED, { sessionId, message: msg });
        }
      }
    } catch (err) {
      logger.error("[AgentInvoker] run error", { agentId: this.agentId, err: String(err) });
    } finally {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
        sessionId,
        agentId: this.agentId,
        isTyping: false,
      });
    }
  }
}
