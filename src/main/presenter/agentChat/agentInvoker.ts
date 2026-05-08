import { z } from "zod";
import { getDb } from "@/db";
import * as groupMsgDao from "@/db/models/groupChatMessageDao";
import * as groupSessionDao from "@/db/models/groupChatSessionDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { eventBus } from "@/eventbus";
import { GROUP_CHAT_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import { buildSystemBlocks } from "./contextBuilder";
import { createLLMClient } from "@/llm";
import type { Tool } from "@/llm";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { CoreMessage } from "./contextBuilder";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";

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
  ): CoreMessage[] {
    const systemBlocks = buildSystemBlocks(agent as Parameters<typeof buildSystemBlocks>[0]);
    const otherIds = participantAgentIds.filter((id) => id !== agentId);
    if (otherIds.length > 0) {
      const lastBlock = systemBlocks[systemBlocks.length - 1];
      systemBlocks[systemBlocks.length - 1] = {
        ...lastBlock,
        text:
          lastBlock.text +
          `\n你正在参与一个群聊。群聊中的其他参与者 ID 为：[${otherIds.join(", ")}]。消息中以 [agentId]: 开头的内容来自其他参与者。`,
      };
    }

    const messages: CoreMessage[] = [{ role: "system", content: systemBlocks }];

    for (const msg of groupMessages) {
      if (msg.hidden) {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.senderAgentId === null) {
        messages.push({ role: "user", content: msg.content });
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
        messages.push({ role: "assistant", content: textContent });
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
        messages.push({ role: "user", content: `[${msg.senderAgentId}]: ${textContent}` });
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
    );

    const blocks: AssistantMessageBlock[] = [];
    let stepCount = 0;

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const stream = client.chat(
          llmMessages,
          tools,
          { model: groupName },
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
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        if (toolCalls.length === 0) break;

        const assistantParts: Array<{ type: string; [key: string]: unknown }> = [];
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
            toolResultParts.push({
              type: "tool-result",
              toolCallId: tc.id,
              toolName: tc.name,
              output: {
                type: "text",
                value: typeof result === "string" ? result : JSON.stringify(result),
              },
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
