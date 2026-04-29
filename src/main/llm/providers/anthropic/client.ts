import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";
import type { LLMClient, Tool, ChatOptions, StreamEvent } from "@/llm/core/types";
import { LLMError } from "@/llm/core/errors";
import { parseSSE } from "@/llm/core/sseParser";
import { parseAnthropicStream } from "./streamParser";
import { buildAnthropicRequest } from "./requestBuilder";

export class AnthropicClient implements LLMClient {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
  ) {}

  async *chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const body = buildAnthropicRequest(messages, tools, options);

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        throw new LLMError("aborted", "Request aborted");
      }
      throw new LLMError("stream_error", err.message);
    }

    if (!response.ok) {
      throw new LLMError("http_error", `HTTP ${response.status}`, response.status);
    }

    yield* parseAnthropicStream(parseSSE(response));
  }
}
