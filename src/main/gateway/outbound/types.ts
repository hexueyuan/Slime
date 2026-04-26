export interface InternalRequest {
  model: string;
  messages: InternalMessage[];
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  tools?: InternalTool[];
  systemPrompt?: string;
  rawHeaders?: Record<string, string>;
}

export interface InternalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: InternalContent[];
}

export type InternalContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; mediaType: string; data: string } | { type: "url"; url: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface InternalTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface InternalResponse {
  content: InternalContent[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  model: string;
  stopReason: string;
}

export type StreamEvent =
  | {
      type: "content_delta";
      delta:
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input_json_delta: string };
    }
  | { type: "usage"; usage: InternalResponse["usage"] }
  | { type: "stop"; stopReason: string; model: string }
  | { type: "error"; error: string };

export interface OutboundAdapter {
  send(request: InternalRequest, config: OutboundConfig): Promise<InternalResponse>;
  sendStream(request: InternalRequest, config: OutboundConfig): AsyncIterable<StreamEvent>;
}

export interface OutboundConfig {
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  timeout?: number;
}
