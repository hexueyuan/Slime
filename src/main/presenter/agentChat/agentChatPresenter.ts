import { z } from "zod";
import { getDb } from "@/db";
import * as messageDao from "@/db/models/agentMessageDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { CHAT_STREAM_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import { buildContext, buildSkillListXML } from "./contextBuilder";
import type { CoreMessage } from "./contextBuilder";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { CapabilityRequirement } from "@shared/types/gateway";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";
import type { ContentPresenter } from "../contentPresenter";
import type { SkillPresenter } from "../skillPresenter";
import type { AgentConfigPresenter } from "../agentConfigPresenter";
import { createLLMClient } from "@/llm";
import type { LLMClient, Tool } from "@/llm";
import { BUILTIN_AGENTS } from "@/agents";
import { MBTI_MAP } from "@shared/constants/mbti";

const MAX_STEPS = 128;

interface PendingQuestion {
  toolCallId: string;
  resolve: (answer: string) => void;
}

interface ToolCall {
  id: string;
  name: string;
  args: string;
}

export class AgentChatPresenter {
  private sessionStates = new Map<string, "idle" | "generating" | "error">();
  private abortControllers = new Map<string, AbortController>();
  private pendingQuestions = new Map<string, PendingQuestion>();

  constructor(
    private gatewayPresenter: GatewayPresenter,
    private toolPresenter: ToolPresenter,
    private contentPresenter: ContentPresenter,
    private skillPresenter?: SkillPresenter,
    private agentConfigPresenter?: AgentConfigPresenter,
  ) {}

  getSessionState(sessionId: string): "idle" | "generating" | "error" {
    return this.sessionStates.get(sessionId) ?? "idle";
  }

  private createClient(): LLMClient {
    return createLLMClient("anthropic", {
      baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}`,
      apiKey: this.gatewayPresenter.getInternalKey(),
    });
  }

  private convertTools(aiSdkTools: Record<string, any>): Record<string, Tool> {
    const result: Record<string, Tool> = {};
    for (const [name, t] of Object.entries(aiSdkTools)) {
      const jsonSchema = t.inputSchema
        ? z.toJSONSchema(t.inputSchema)
        : { type: "object", properties: {} };
      result[name] = {
        description: t.description,
        parameters: jsonSchema as Record<string, unknown>,
      };
    }
    return result;
  }

  private pushToRenderer(
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
  ): void {
    eventBus.sendToRenderer(CHAT_STREAM_EVENTS.RESPONSE, {
      sessionId,
      messageId,
      blocks: [...blocks],
    });
  }

  private async collectStreamResult(
    client: LLMClient,
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: { model: string; maxTokens?: number; thinkingBudget?: number },
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
    abortSignal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
    let textContent = "";
    let currentContentBlock: AssistantMessageBlock | null = null;
    const pendingToolCalls = new Map<string, { id: string; name: string; inputJson: string }>();
    const completedToolCalls: ToolCall[] = [];

    const stream = client.chat(messages, tools, options, abortSignal);

    for await (const event of stream) {
      if (abortSignal.aborted) break;

      if (event.type === "text") {
        textContent += event.text;
        if (!currentContentBlock) {
          currentContentBlock = {
            type: "content",
            content: "",
            status: "loading",
            timestamp: Date.now(),
          };
          blocks.push(currentContentBlock);
        }
        currentContentBlock.content = (currentContentBlock.content || "") + event.text;
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (event.type === "tool_call_start") {
        pendingToolCalls.set(event.id, { id: event.id, name: event.name, inputJson: "" });
      } else if (event.type === "tool_call_delta") {
        const tc = pendingToolCalls.get(event.id);
        if (tc) tc.inputJson += event.delta;
      } else if (event.type === "tool_call_end") {
        const tc = pendingToolCalls.get(event.id);
        if (tc) {
          let argsObj: unknown;
          try {
            argsObj = event.input ?? JSON.parse(tc.inputJson || "{}");
          } catch {
            argsObj = {};
          }
          const argsStr = JSON.stringify(argsObj);
          completedToolCalls.push({ id: tc.id, name: tc.name, args: argsStr });
          blocks.push({
            type: "tool_call",
            id: tc.id,
            content: "",
            status: "loading",
            timestamp: Date.now(),
            tool_call: { id: tc.id, name: tc.name, input: argsObj },
          });
          pendingToolCalls.delete(event.id);
        }
      } else if (event.type === "thinking_start") {
        blocks.push({
          type: "thinking",
          thinking: "",
          signature: "",
          status: "loading",
          timestamp: Date.now(),
        });
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (event.type === "thinking_delta") {
        const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
        if (lastThinking && lastThinking.thinking !== undefined) {
          lastThinking.thinking += event.text;
          this.pushToRenderer(sessionId, messageId, blocks);
        }
      } else if (event.type === "signature_delta") {
        const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
        if (lastThinking && lastThinking.signature !== undefined) {
          lastThinking.signature += event.signature;
          this.pushToRenderer(sessionId, messageId, blocks);
        }
      } else if (event.type === "thinking_end") {
        const lastThinking = [...blocks].reverse().find((b) => b.type === "thinking");
        if (lastThinking) {
          lastThinking.thinking = event.thinking;
          lastThinking.signature = event.signature;
          lastThinking.status = "success";
          this.pushToRenderer(sessionId, messageId, blocks);
        }
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }

    if (currentContentBlock) {
      currentContentBlock.status = "success";
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    if (completedToolCalls.length > 0) {
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    return { textContent, toolCalls: completedToolCalls };
  }

  private async executeTool(
    sessionId: string,
    toolCall: ToolCall,
    blocks: AssistantMessageBlock[],
    messageId: string,
  ): Promise<string> {
    const { id, name, args } = toolCall;
    const parsedArgs = JSON.parse(args);
    const block = blocks.find((b) => b.type === "tool_call" && b.id === id);
    if (block) block.status = "loading";
    this.pushToRenderer(sessionId, messageId, blocks);

    try {
      let result: unknown;

      if (name === "ask_user") {
        const { question, options, multiple, html_file } = parsedArgs;
        let htmlContent: string | undefined;
        if (html_file) {
          try {
            htmlContent = (await this.toolPresenter.callTool(sessionId, "read", {
              path: html_file,
            })) as string;
          } catch {
            /* ignore */
          }
        }
        this.contentPresenter.setContent(sessionId, {
          type: "interaction" as const,
          sessionId,
          toolCallId: id,
          question,
          options: options || [],
          multiple: multiple || false,
          htmlContent,
        });
        result = await new Promise<string>((resolve) => {
          this.pendingQuestions.set(sessionId, { toolCallId: id, resolve });
        });
        this.contentPresenter.clearContent(sessionId);
      } else {
        result = await this.toolPresenter.callTool(sessionId, name, parsedArgs);
      }

      if (block && block.tool_call) {
        block.status = "success";
        block.tool_call.output = result;
      }
      this.pushToRenderer(sessionId, messageId, blocks);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (block && block.tool_call) {
        block.status = "error";
        block.tool_call.output = `Error: ${errorMsg}`;
      }
      this.pushToRenderer(sessionId, messageId, blocks);
      return `Error: ${errorMsg}`;
    }
  }

  async chat(sessionId: string, content: string): Promise<void> {
    if (this.sessionStates.get(sessionId) === "generating") return;
    const db = getDb();
    this.sessionStates.set(sessionId, "generating");
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const session = sessionDao.getSessionById(db, sessionId);
    if (!session) {
      this.sessionStates.set(sessionId, "error");
      this.abortControllers.delete(sessionId);
      return;
    }
    const config = configDao.getConfigById(db, sessionId);
    const agent = agentDao.getAgentById(db, session.agentId);

    // Inject session context for exec tool env injection
    this.toolPresenter.setSessionContext(
      sessionId,
      session.agentId,
      agent?.type ?? "custom",
      agent?.config?.allowedCliCommands,
    );

    const capReqs: CapabilityRequirement = (config?.capabilityRequirements ??
      agent?.config?.capabilityRequirements ?? ["reasoning"]) as CapabilityRequirement;
    const selectResult = this.gatewayPresenter.select(capReqs);
    const firstCap = capReqs[0];
    const capKey = Array.isArray(firstCap) ? firstCap[0] : (firstCap ?? "reasoning");
    const groupName = selectResult.matched[capKey]?.groupName;
    if (!groupName) {
      this.sessionStates.set(sessionId, "error");
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(CHAT_STREAM_EVENTS.ERROR, {
        sessionId,
        error: "No model configured. Please add a channel in Gateway settings.",
      });
      return;
    }

    // Save user message
    const userSeq = messageDao.getNextOrderSeq(db, sessionId);
    messageDao.createMessage(db, {
      id: crypto.randomUUID(),
      sessionId,
      orderSeq: userSeq,
      role: "user",
      content,
      status: "sent",
    });

    // Build skill list for this agent
    const skillListXML =
      this.skillPresenter && this.agentConfigPresenter
        ? buildSkillListXML(
            this.skillPresenter.getSkillList(
              session.agentId,
              (await this.agentConfigPresenter.getAgentSkillsDir(session.agentId)) ?? undefined,
              agent?.config?.enabledSkills ?? [],
            ),
          )
        : this.skillPresenter
          ? buildSkillListXML(
              this.skillPresenter.getSkillList(
                session.agentId,
                undefined,
                agent?.config?.enabledSkills,
              ),
            )
          : null;

    // Build system prompt: MBTI personality + additional prompt (prompt.md)
    const mbtiPrompt = agent?.mbti ? (MBTI_MAP[agent.mbti]?.personality ?? "") : "";
    const additionalPrompt =
      agent?.type === "builtin"
        ? (BUILTIN_AGENTS.find((b) => b.id === agent.id)?.config?.additionalPrompt ??
          agent?.config?.additionalPrompt ??
          "")
        : (agent?.config?.additionalPrompt ?? "");
    const promptFromFile =
      !additionalPrompt && this.agentConfigPresenter
        ? await this.agentConfigPresenter.readPromptMd(session.agentId)
        : "";
    const rawPrompt = additionalPrompt || promptFromFile;
    const agentSystemPrompt = mbtiPrompt
      ? rawPrompt
        ? mbtiPrompt + "\n\n" + rawPrompt
        : mbtiPrompt
      : rawPrompt;

    // Build context — contextBuilder deduplicates newUserContent from history
    const messages: CoreMessage[] = buildContext(sessionId, content, db, {
      agentSystemPrompt,
      skillListXML,
    });
    const client = this.createClient();

    // Filter tools by enabledTools whitelist
    const enabledTools = agent?.config?.enabledTools;
    const allAiSdkTools = await this.toolPresenter.getToolSet(sessionId);
    const filteredAiSdkTools: Record<string, any> = enabledTools
      ? Object.fromEntries(Object.entries(allAiSdkTools).filter(([k]) => enabledTools.includes(k)))
      : {};

    const tools = this.convertTools(filteredAiSdkTools);

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();
    let stepCount = 0;

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const { textContent, toolCalls } = await this.collectStreamResult(
          client,
          messages,
          tools,
          {
            model: groupName,
            maxTokens: agent?.config?.enableThinking
              ? (config?.maxTokens ?? agent?.config?.maxTokens ?? 16000)
              : (config?.maxTokens ?? agent?.config?.maxTokens ?? undefined),
            thinkingBudget: agent?.config?.enableThinking ? 10000 : undefined,
          },
          sessionId,
          assistantMessageId,
          blocks,
          abortController.signal,
        );

        if (toolCalls.length === 0) break;

        // Append assistant message to context
        const assistantParts: any[] = [];
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
            input: JSON.parse(tc.args),
          });
        }
        messages.push({ role: "assistant", content: assistantParts });

        // Execute tools
        const toolResultParts: any[] = [];
        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;
          const toolResult = await this.executeTool(sessionId, tc, blocks, assistantMessageId);
          toolResultParts.push({
            type: "tool-result",
            toolCallId: tc.id,
            toolName: tc.name,
            output: { type: "text", value: toolResult },
          });
        }
        messages.push({ role: "tool", content: toolResultParts });
      }

      // Finalize blocks
      for (const block of blocks) {
        if (block.status === "loading") block.status = "success";
      }

      // Save assistant message
      const assistantSeq = messageDao.getNextOrderSeq(db, sessionId);
      messageDao.createMessage(db, {
        id: assistantMessageId,
        sessionId,
        orderSeq: assistantSeq,
        role: "assistant",
        content: JSON.stringify(blocks),
        status: "sent",
      });

      // Touch session updated_at (without overwriting title that may have been generated)
      sessionDao.touchUpdatedAt(db, sessionId);

      this.sessionStates.set(sessionId, "idle");
      eventBus.sendToRenderer(CHAT_STREAM_EVENTS.END, {
        sessionId,
        messageId: assistantMessageId,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        for (const block of blocks) if (block.status === "loading") block.status = "success";
        // Save whatever blocks were collected before abort
        if (blocks.length > 0) {
          const assistantSeq = messageDao.getNextOrderSeq(db, sessionId);
          messageDao.createMessage(db, {
            id: assistantMessageId,
            sessionId,
            orderSeq: assistantSeq,
            role: "assistant",
            content: JSON.stringify(blocks),
            status: "sent",
          });
        }
        this.sessionStates.set(sessionId, "idle");
        eventBus.sendToRenderer(CHAT_STREAM_EVENTS.END, {
          sessionId,
          messageId: assistantMessageId,
        });
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("AgentChatPresenter chat error", { sessionId, error: errorMsg });
        this.sessionStates.set(sessionId, "error");
        eventBus.sendToRenderer(CHAT_STREAM_EVENTS.ERROR, { sessionId, error: errorMsg });
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  stopGeneration(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
    }
    const pending = this.pendingQuestions.get(sessionId);
    if (pending) {
      pending.resolve("[User cancelled]");
      this.pendingQuestions.delete(sessionId);
    }
    this.sessionStates.set(sessionId, "idle");
  }

  async retryLastMessage(sessionId: string): Promise<void> {
    const db = getDb();
    const allMsgs = messageDao.listBySession(db, sessionId);
    const lastAssistant = [...allMsgs].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const lastUser = [...allMsgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    messageDao.deleteMessage(db, lastAssistant.id);
    messageDao.deleteMessage(db, lastUser.id);
    await this.chat(sessionId, lastUser.content);
  }

  answerQuestion(sessionId: string, toolCallId: string, answer: string): void {
    const pending = this.pendingQuestions.get(sessionId);
    if (pending?.toolCallId === toolCallId) {
      pending.resolve(answer);
      this.pendingQuestions.delete(sessionId);
    }
  }
}
