import type { LLMClient, LLMClientConfig } from "@/llm/core/types";
import { AnthropicClient } from "@/llm/providers/anthropic/client";

export type LLMProvider = "anthropic";

export function createLLMClient(provider: LLMProvider, config: LLMClientConfig): LLMClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(config.baseURL, config.apiKey);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
