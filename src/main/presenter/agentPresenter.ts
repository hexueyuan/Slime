import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { IAgentPresenter } from "@shared/types/presenters";
import type {
  UserMessageContent,
  AssistantMessageBlock,
  ChatMessageRecord,
} from "@shared/types/chat";
import { STREAM_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger } from "@/utils";
import type { SessionPresenter } from "./sessionPresenter";
import type { ConfigPresenter } from "./configPresenter";
import type { ToolPresenter } from "./toolPresenter";
import { EVOLAB_SYSTEM_PROMPT } from "./systemPrompt";

interface ToolCall {
  id: string;
  name: string;
  args: string;
}

interface PendingQuestionState {
  toolCallId: string;
  resolve: (answer: string) => void;
}

export class AgentPresenter implements IAgentPresenter {
  private abortControllers = new Map<string, AbortController>();
  private pendingQuestions = new Map<string, PendingQuestionState>();

  constructor(
    private sessionPresenter: SessionPresenter,
    private configPresenter: ConfigPresenter,
    private toolPresenter: ToolPresenter,
  ) {}

  private async getConfig() {
    return {
      provider:
        ((await this.configPresenter.get("ai.provider")) as string) ||
        process.env.SLIME_AI_PROVIDER ||
        "anthropic",
      apiKey:
        ((await this.configPresenter.get("ai.apiKey")) as string) ||
        process.env.SLIME_AI_API_KEY ||
        "",
      model:
        ((await this.configPresenter.get("ai.model")) as string) ||
        process.env.SLIME_AI_MODEL ||
        "claude-sonnet-4-20250514",
      baseUrl:
        ((await this.configPresenter.get("ai.baseUrl")) as string) ||
        process.env.SLIME_AI_BASE_URL ||
        undefined,
    };
  }

  private createModel(config: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }) {
    if (config.provider === "anthropic") {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(config.model);
    }
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    return provider(config.model);
  }

  private async buildMessages(sessionId: string): Promise<
    Array<{
      role: "user" | "assistant" | "tool";
      content: string;
      tool_calls?: any[];
      tool_call_id?: string;
    }>
  > {
    const records = await this.sessionPresenter.getMessages(sessionId);
    const messages: Array<{
      role: "user" | "assistant" | "tool";
      content: string;
      tool_calls?: any[];
      tool_call_id?: string;
    }> = [];
    for (const record of records) {
      if (record.role === "user") {
        const parsed = JSON.parse(record.content) as UserMessageContent;
        messages.push({ role: "user", content: parsed.text });
      } else {
        const blocks = JSON.parse(record.content) as AssistantMessageBlock[];
        const text = blocks
          .filter((b) => b.type === "content")
          .map((b) => b.content || "")
          .join("");
        if (text) messages.push({ role: "assistant", content: text });
      }
    }
    return messages;
  }

  private pushToRenderer(
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
  ): void {
    eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, messageId, [...blocks]);
  }

  private updateToolBlockStatus(
    blocks: AssistantMessageBlock[],
    toolCallId: string,
    status: AssistantMessageBlock["status"],
  ): void {
    const block = blocks.find((b) => b.type === "tool_call" && b.id === toolCallId);
    if (block) block.status = status;
  }

  private updateToolBlockResult(
    blocks: AssistantMessageBlock[],
    toolCallId: string,
    status: AssistantMessageBlock["status"],
    result: unknown,
  ): void {
    const block = blocks.find((b) => b.type === "tool_call" && b.id === toolCallId);
    if (block && block.tool_call) {
      block.status = status;
      block.tool_call.response = typeof result === "string" ? result : JSON.stringify(result);
    }
  }

  private async collectStream(
    stream: AsyncIterable<any>,
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
    abortSignal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
    let textContent = "";
    const toolCalls: ToolCall[] = [];
    let currentContentBlock: AssistantMessageBlock | null = null;
    let currentReasoningBlock: AssistantMessageBlock | null = null;

    for await (const event of stream) {
      if (abortSignal.aborted) break;
      const e = event as any;

      if (e.type === "text-delta") {
        textContent += e.textDelta;
        if (!currentContentBlock) {
          currentContentBlock = {
            type: "content",
            content: "",
            status: "loading",
            timestamp: Date.now(),
          };
          blocks.push(currentContentBlock);
        }
        currentContentBlock.content += e.textDelta;
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "reasoning" || e.type === "reasoning-delta") {
        const delta = e.textDelta || e.text || "";
        if (!currentReasoningBlock) {
          currentReasoningBlock = {
            type: "reasoning_content",
            content: "",
            status: "loading",
            timestamp: Date.now(),
            reasoning_time: { start: Date.now(), end: 0 },
          };
          blocks.unshift(currentReasoningBlock);
        }
        currentReasoningBlock.content += delta;
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "tool-call") {
        toolCalls.push({
          id: e.toolCallId,
          name: e.toolName,
          args: JSON.stringify(e.args),
        });
        blocks.push({
          type: "tool_call",
          id: e.toolCallId,
          content: "",
          status: "loading",
          timestamp: Date.now(),
          tool_call: {
            name: e.toolName,
            params: JSON.stringify(e.args),
          },
        });
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "finish" || e.type === "step-finish") {
        if (currentContentBlock && currentContentBlock.status === "loading") {
          currentContentBlock.status = "success";
        }
        if (currentReasoningBlock) {
          if (currentReasoningBlock.status === "loading") {
            currentReasoningBlock.status = "success";
          }
          if (currentReasoningBlock.reasoning_time) {
            currentReasoningBlock.reasoning_time.end = Date.now();
          }
        }
        currentContentBlock = null;
        currentReasoningBlock = null;
      }
    }

    return { textContent, toolCalls };
  }

  private async handleAskUser(
    sessionId: string,
    toolCallId: string,
    args: { question: string; options?: string[] },
    messageId: string,
  ): Promise<string> {
    eventBus.sendToRenderer(STREAM_EVENTS.QUESTION, sessionId, {
      messageId,
      toolCallId,
      question: args.question,
      options: args.options,
    });

    const answer = await new Promise<string>((resolve) => {
      this.pendingQuestions.set(sessionId, { toolCallId, resolve });
    });

    return answer;
  }

  private async executeTool(
    sessionId: string,
    toolCall: ToolCall,
    blocks: AssistantMessageBlock[],
    messageId: string,
  ): Promise<string> {
    const { id, name, args } = toolCall;
    const parsedArgs = JSON.parse(args);

    this.updateToolBlockStatus(blocks, id, "loading");
    this.pushToRenderer(sessionId, messageId, blocks);

    try {
      let result: unknown;

      if (name === "ask_user") {
        result = await this.handleAskUser(sessionId, id, parsedArgs, messageId);
      } else {
        result = await this.toolPresenter.callTool(sessionId, name, parsedArgs);
      }

      this.updateToolBlockResult(blocks, id, "success", result);
      this.pushToRenderer(sessionId, messageId, blocks);

      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateToolBlockResult(blocks, id, "error", `Error: ${errorMsg}`);
      this.pushToRenderer(sessionId, messageId, blocks);
      return `Error: ${errorMsg}`;
    }
  }

  async chat(sessionId: string, content: UserMessageContent): Promise<void> {
    const MAX_STEPS = 128;
    let stepCount = 0;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const config = await this.getConfig();
    if (!config.apiKey) {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, "API key not configured");
      return;
    }

    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: JSON.stringify(content),
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionPresenter.saveMessage(userMessage);

    const messages = await this.buildMessages(sessionId);
    const model = this.createModel(config);
    const tools = this.toolPresenter.getToolSet(sessionId);

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const result = streamText({
          model,
          system: EVOLAB_SYSTEM_PROMPT,
          messages: messages as any,
          tools: tools as any,
          abortSignal: abortController.signal,
        });

        const { textContent, toolCalls } = await this.collectStream(
          result.fullStream,
          sessionId,
          assistantMessageId,
          blocks,
          abortController.signal,
        );

        if (toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: "assistant",
          content: textContent,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.args },
          })),
        });

        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;

          const toolResult = await this.executeTool(sessionId, tc, blocks, assistantMessageId);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
      }

      for (const block of blocks) {
        if (block.status === "loading") block.status = "success";
      }

      const assistantMessage: ChatMessageRecord = {
        id: assistantMessageId,
        sessionId,
        role: "assistant",
        content: JSON.stringify(blocks),
        status: "sent",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.sessionPresenter.saveMessage(assistantMessage);
      eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
    } catch (err) {
      if (abortController.signal.aborted) {
        for (const block of blocks) block.status = "cancel";
        eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("AgentPresenter chat error", { sessionId, error: errorMsg });
        eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, errorMsg);
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  async stopGeneration(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
      logger.info("Generation stopped", { sessionId });
    }

    const pending = this.pendingQuestions.get(sessionId);
    if (pending) {
      pending.resolve("[User cancelled]");
      this.pendingQuestions.delete(sessionId);
    }
  }

  async answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void> {
    const pending = this.pendingQuestions.get(sessionId);
    if (pending?.toolCallId === toolCallId) {
      pending.resolve(answer);
      this.pendingQuestions.delete(sessionId);
    }
  }
}
