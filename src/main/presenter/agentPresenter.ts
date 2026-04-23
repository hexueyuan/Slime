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

export class AgentPresenter implements IAgentPresenter {
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private sessionPresenter: SessionPresenter,
    private configPresenter: ConfigPresenter,
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

  private async buildMessages(
    sessionId: string,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const records = await this.sessionPresenter.getMessages(sessionId);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
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

  async chat(sessionId: string, content: UserMessageContent): Promise<void> {
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

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();

    try {
      const result = streamText({
        model,
        messages,
        abortSignal: abortController.signal,
      });

      let currentContentBlock: AssistantMessageBlock | null = null;
      let currentReasoningBlock: AssistantMessageBlock | null = null;

      for await (const event of result.fullStream) {
        if (abortController.signal.aborted) break;

        if (event.type === "text-delta") {
          if (!currentContentBlock) {
            currentContentBlock = {
              type: "content",
              content: "",
              status: "loading",
              timestamp: Date.now(),
            };
            blocks.push(currentContentBlock);
          }
          currentContentBlock.content += event.text;
          eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, assistantMessageId, [
            ...blocks,
          ]);
        } else if (event.type === "reasoning-delta") {
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
          currentReasoningBlock.content += event.text;
          eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, assistantMessageId, [
            ...blocks,
          ]);
        } else if (event.type === "finish") {
          for (const block of blocks) {
            block.status = "success";
          }
          if (currentReasoningBlock?.reasoning_time) {
            currentReasoningBlock.reasoning_time.end = Date.now();
          }
        }
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
  }
}
