import { streamText, generateText } from "ai";
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
import type { EvolutionPresenter } from "./evolutionPresenter";
import type { ContentPresenter } from "./contentPresenter";
import { buildSystemPrompt } from "./systemPrompt";

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
    private evolutionPresenter: EvolutionPresenter,
    private contentPresenter: ContentPresenter,
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

  /**
   * 从存储的消息记录构建 AI SDK 兼容的消息数组
   * assistant 消息需要从 blocks 重建为 CoreMessage 格式
   */
  private async buildMessages(sessionId: string): Promise<any[]> {
    const records = await this.sessionPresenter.getMessages(sessionId);
    const messages: any[] = [];

    for (const record of records) {
      if (record.role === "user") {
        const parsed = JSON.parse(record.content) as UserMessageContent;
        messages.push({ role: "user", content: parsed.text });
      } else {
        // assistant 消息：从 blocks 重建
        const blocks = JSON.parse(record.content) as AssistantMessageBlock[];

        // 提取文本内容
        const textContent = blocks
          .filter((b) => b.type === "content")
          .map((b) => b.content || "")
          .join("");

        // 提取工具调用
        const toolCallBlocks = blocks.filter((b) => b.type === "tool_call" && b.tool_call);

        if (toolCallBlocks.length === 0) {
          // 纯文本消息
          if (textContent) {
            messages.push({ role: "assistant", content: textContent });
          }
        } else {
          // 带工具调用的消息：使用 AI SDK v6 CoreMessage 格式
          const parts: any[] = [];
          if (textContent) {
            parts.push({ type: "text", text: textContent });
          }
          for (const b of toolCallBlocks) {
            parts.push({
              type: "tool-call",
              toolCallId: b.id,
              toolName: b.tool_call!.name,
              input: b.tool_call!.params ? JSON.parse(b.tool_call!.params) : {},
            });
          }
          messages.push({ role: "assistant", content: parts });

          // 添加对应的 tool result 消息
          const toolResults: any[] = [];
          for (const b of toolCallBlocks) {
            toolResults.push({
              type: "tool-result",
              toolCallId: b.id,
              toolName: b.tool_call!.name,
              output: { type: "text", value: b.tool_call!.response || "" },
            });
          }
          messages.push({ role: "tool", content: toolResults });
        }
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

  /**
   * 使用 textStream 流式读取文本，然后获取 toolCalls
   * 比 fullStream 更可靠，因为某些 OpenAI 兼容 API 的 fullStream 不产生 text-delta 事件
   */
  private async collectStreamResult(
    result: {
      textStream: AsyncIterable<string>;
      toolCalls: PromiseLike<any[]>;
    },
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
    abortSignal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
    let textContent = "";
    let currentContentBlock: AssistantMessageBlock | null = null;

    // 1. 流式读取文本
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
      currentContentBlock.content += chunk;
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    // 标记文本完成
    if (currentContentBlock) {
      currentContentBlock.status = "success";
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    // 2. 获取工具调用
    const rawToolCalls = await result.toolCalls;
    const toolCalls: ToolCall[] = [];

    for (const tc of rawToolCalls || []) {
      const argsObj = tc.input ?? tc.args ?? {};
      const argsStr = JSON.stringify(argsObj);
      toolCalls.push({
        id: tc.toolCallId,
        name: tc.toolName,
        args: argsStr,
      });
      blocks.push({
        type: "tool_call",
        id: tc.toolCallId,
        content: "",
        status: "loading",
        timestamp: Date.now(),
        tool_call: {
          name: tc.toolName,
          params: argsStr,
        },
      });
    }

    if (toolCalls.length > 0) {
      this.pushToRenderer(sessionId, messageId, blocks);
    }

    return { textContent, toolCalls };
  }

  private async handleAskUser(
    sessionId: string,
    toolCallId: string,
    _args: { question: string; options?: string[] },
  ): Promise<string> {
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
        const { question, options, multiple, html_file } = parsedArgs;
        let htmlContent: string | undefined;
        if (html_file) {
          try {
            htmlContent = (await this.toolPresenter.callTool(sessionId, "read", {
              path: html_file,
            })) as string;
          } catch {
            /* ignore read failure */
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
        result = await this.handleAskUser(sessionId, id, parsedArgs);
        this.contentPresenter.clearContent(sessionId);
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

  async chat(
    sessionId: string,
    content: UserMessageContent,
    options?: { hidden?: boolean },
  ): Promise<void> {
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
      ...(options?.hidden && { hidden: true }),
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

        const systemPrompt = await buildSystemPrompt(this.evolutionPresenter.getStatus().stage);
        const result = streamText({
          model,
          system: systemPrompt,
          messages: messages as any,
          tools: tools as any,
          abortSignal: abortController.signal,
        });

        const { textContent, toolCalls } = await this.collectStreamResult(
          result,
          sessionId,
          assistantMessageId,
          blocks,
          abortController.signal,
        );

        if (toolCalls.length === 0) {
          break;
        }

        // AI SDK v6 CoreMessage 格式：assistant 带 toolCalls
        const assistantParts: any[] = [];
        if (textContent) {
          assistantParts.push({ type: "text", text: textContent });
        }
        for (const tc of toolCalls) {
          assistantParts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.name,
            input: JSON.parse(tc.args),
          });
        }
        messages.push({ role: "assistant", content: assistantParts });

        // 执行工具并以 tool-result 格式回填
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

      // evolution_complete 只做了 prepare，loop 结束后统一 commit
      // 确保 AI 在 complete 之后的 format/lint 修改也被收进去
      const finalized = await this.evolutionPresenter.finalizeEvolution();
      if (finalized) {
        await this.evolutionPresenter.applyEvolution();
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

  async verifyApiKey(
    provider: string,
    apiKey: string,
    model: string,
    baseUrl?: string,
  ): Promise<{ success: boolean; error?: string; modelName?: string }> {
    try {
      const aiModel = this.createModel({ provider, apiKey, model, baseUrl });
      await generateText({
        model: aiModel,
        messages: [{ role: "user", content: "hi" }],
        maxOutputTokens: 1,
      });
      return { success: true, modelName: model };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn("API key verification failed", { provider, error });
      return { success: false, error };
    }
  }
}
