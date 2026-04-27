import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getDb } from "@/db";
import * as messageDao from "@/db/models/agentMessageDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { CHAT_STREAM_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import { buildContext } from "./contextBuilder";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { CapabilityRequirement } from "@shared/types/gateway";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";
import type { ContentPresenter } from "../contentPresenter";

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
  ) {}

  getSessionState(sessionId: string): "idle" | "generating" | "error" {
    return this.sessionStates.get(sessionId) ?? "idle";
  }

  private createModel(groupName: string) {
    const provider = createAnthropic({
      apiKey: this.gatewayPresenter.getInternalKey(),
      baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}/v1/`,
    });
    return provider(groupName);
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
    result: { textStream: AsyncIterable<string>; toolCalls: PromiseLike<any[]> },
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
    abortSignal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
    let textContent = "";
    let currentContentBlock: AssistantMessageBlock | null = null;

    for await (const chunk of result.textStream) {
      if (abortSignal.aborted) break;
      if (!chunk) continue;

      textContent += chunk;
      if (!currentContentBlock) {
        currentContentBlock = {
          type: "content",
          content: "",
          status: "loading",
          timestamp: Date.now(),
        };
        blocks.push(currentContentBlock);
      }
      currentContentBlock.content = (currentContentBlock.content || "") + chunk;
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    if (currentContentBlock) {
      currentContentBlock.status = "success";
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    const rawToolCalls = await result.toolCalls;
    const toolCalls: ToolCall[] = [];

    for (const tc of rawToolCalls || []) {
      const argsObj = tc.input ?? tc.args ?? {};
      const argsStr = JSON.stringify(argsObj);
      toolCalls.push({ id: tc.toolCallId, name: tc.toolName, args: argsStr });
      blocks.push({
        type: "tool_call",
        id: tc.toolCallId,
        content: "",
        status: "loading",
        timestamp: Date.now(),
        tool_call: { id: tc.toolCallId, name: tc.toolName, input: argsObj },
      });
    }

    if (toolCalls.length > 0) {
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    return { textContent, toolCalls };
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

    const capReqs: CapabilityRequirement = (config?.capabilityRequirements ??
      agent?.config?.capabilityRequirements ?? ["chat"]) as CapabilityRequirement;
    const selectResult = this.gatewayPresenter.select(capReqs);
    const firstCap = capReqs[0];
    const capKey = Array.isArray(firstCap) ? firstCap[0] : (firstCap ?? "chat");
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

    const messages: any[] = buildContext(sessionId, content, db);
    const model = this.createModel(groupName);

    // Filter disabled tools
    const disabledTools = agent?.config?.disabledTools ?? [];
    const allTools = this.toolPresenter.getToolSet(sessionId);
    const tools =
      disabledTools.length > 0
        ? Object.fromEntries(Object.entries(allTools).filter(([k]) => !disabledTools.includes(k)))
        : allTools;

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();
    let stepCount = 0;

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const systemPrompt =
          config?.systemPrompt || agent?.config?.systemPrompt || "You are a helpful AI assistant.";
        const result = streamText({
          model,
          system: systemPrompt,
          messages: messages as any,
          tools: tools as any,
          abortSignal: abortController.signal,
          maxOutputTokens: config?.maxTokens ?? agent?.config?.maxTokens ?? undefined,
        });

        const { textContent, toolCalls } = await this.collectStreamResult(
          result,
          sessionId,
          assistantMessageId,
          blocks,
          abortController.signal,
        );

        if (toolCalls.length === 0) break;

        // Append assistant message to context
        const assistantParts: any[] = [];
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

      // Touch session updated_at
      sessionDao.updateTitle(db, sessionId, session.title);

      this.sessionStates.set(sessionId, "idle");
      eventBus.sendToRenderer(CHAT_STREAM_EVENTS.END, {
        sessionId,
        messageId: assistantMessageId,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        for (const block of blocks) if (block.status === "loading") block.status = "success";
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

    messageDao.updateMessage(db, lastAssistant.id, { status: "error" });
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
