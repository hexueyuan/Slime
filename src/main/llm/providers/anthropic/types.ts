/**
 * Anthropic API 请求体
 */
export type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: string };
};

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  stream: boolean;
  system?: string | AnthropicSystemBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  /** Extended thinking 配置 */
  thinking?: { type: "enabled"; budget_tokens: number };
}

/**
 * Anthropic 消息
 */
export interface AnthropicMessage {
  role: string;
  content: string | AnthropicContentBlock[];
}

/**
 * Anthropic 内容块
 */
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64" | "url"; media_type?: string; data?: string; url?: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

/**
 * Anthropic 工具定义
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: string };
}

/**
 * Anthropic SSE 事件 payload
 */
export interface AnthropicSSEPayload {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    thinking?: string;
    signature?: string;
    data?: string;
  };
  index?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}
