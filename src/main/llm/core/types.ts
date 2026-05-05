import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";

/**
 * 统一流事件类型
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_end"; id: string; input: unknown }
  | { type: "thinking_start" }
  | { type: "thinking_delta"; text: string }
  | { type: "signature_delta"; signature: string }
  | { type: "thinking_end"; thinking: string; signature: string }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Token 使用统计
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * LLM 客户端统一接口
 */
export interface LLMClient {
  chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent>;
}

/**
 * 对话选项
 */
export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** 传入时向 Anthropic API 发送 extended thinking 参数，值为 budget_tokens */
  thinkingBudget?: number;
}

/**
 * 工具定义
 */
export interface Tool {
  description?: string;
  parameters: Record<string, unknown>;
}

/**
 * 客户端配置
 */
export interface LLMClientConfig {
  baseURL: string;
  apiKey: string;
}
