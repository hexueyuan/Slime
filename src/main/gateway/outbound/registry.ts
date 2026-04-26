import type { ChannelType } from "@shared/types/gateway";
import type { OutboundAdapter } from "./types";
import { createAnthropicOutbound } from "./anthropic";
import { createOpenAIChatOutbound } from "./openai-chat";
import { createGeminiOutbound } from "./gemini";
import { createDeepSeekOutbound } from "./deepseek";
import { createVolcengineOutbound } from "./volcengine";
import { createCustomOutbound } from "./custom";

const adapters = new Map<string, OutboundAdapter>();

export function registerAdapter(type: string, adapter: OutboundAdapter): void {
  adapters.set(type, adapter);
}

export function getAdapter(type: ChannelType): OutboundAdapter {
  const adapter = adapters.get(type);
  if (!adapter) throw new Error(`No adapter for channel type: ${type}`);
  return adapter;
}

export function initAdapters(): void {
  registerAdapter("anthropic", createAnthropicOutbound());
  registerAdapter("openai", createOpenAIChatOutbound());
  registerAdapter("gemini", createGeminiOutbound());
  registerAdapter("deepseek", createDeepSeekOutbound());
  registerAdapter("volcengine", createVolcengineOutbound());
  registerAdapter("custom", createCustomOutbound());
}
