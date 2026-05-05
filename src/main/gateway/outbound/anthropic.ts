import type {
  InternalRequest,
  InternalResponse,
  InternalMessage,
  InternalContent,
  OutboundAdapter,
} from "./types";
import { httpRequest, parseSSEStream } from "./base";

export function toAnthropicRequest(req: InternalRequest) {
  const extracted = req.messages
    .filter((m) => m.role === "system")
    .map((m) =>
      m.content
        .filter((c): c is Extract<InternalContent, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("\n"),
    )
    .join("\n");
  const system = req.systemPrompt ?? (extracted || undefined);

  const messages = req.messages
    .filter((m) => m.role !== "system" && m.content.length > 0)
    .map((m) => ({
      role: m.role === "tool" ? ("user" as const) : m.role,
      content: convertContent(m),
    }));

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
  };

  // system: 优先用 systemParts（数组格式），fallback 到 systemPrompt（字符串）
  if (req.systemParts) {
    body.system = req.systemParts.map((p) => {
      const part: Record<string, unknown> = { type: p.type, text: p.text };
      if (p.cacheControl) {
        const cc: Record<string, unknown> = { type: p.cacheControl.type };
        if (p.cacheControl.ttl) cc.ttl = p.cacheControl.ttl;
        part.cache_control = cc;
      }
      return part;
    });
  } else if (system) {
    body.system = system;
  }

  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.stream) body.stream = true;

  if (req.tools?.length) {
    body.tools = req.tools.map((t) => {
      const tool: Record<string, unknown> = {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      };
      if (t.cacheControl) {
        const cc: Record<string, unknown> = { type: t.cacheControl.type };
        if (t.cacheControl.ttl) cc.ttl = t.cacheControl.ttl;
        tool.cache_control = cc;
      }
      return tool;
    });
  }

  if (req.cacheControl) {
    const cc: Record<string, unknown> = { type: req.cacheControl.type };
    if (req.cacheControl.ttl) cc.ttl = req.cacheControl.ttl;
    body.cache_control = cc;
  }

  if (req.thinking) body.thinking = req.thinking;

  return body;
}

function convertContent(msg: InternalMessage) {
  return msg.content.map((c) => {
    let result: Record<string, unknown>;
    switch (c.type) {
      case "text":
        result = { type: "text" as const, text: c.text };
        break;
      case "image":
        result = {
          type: "image" as const,
          source:
            c.source.type === "base64"
              ? { type: "base64" as const, media_type: c.source.mediaType, data: c.source.data }
              : { type: "url" as const, url: c.source.url },
        };
        break;
      case "tool_use":
        result = { type: "tool_use" as const, id: c.id, name: c.name, input: c.input };
        break;
      case "tool_result":
        result = {
          type: "tool_result" as const,
          tool_use_id: c.toolUseId,
          content: c.content,
          is_error: c.isError,
        };
        break;
      case "thinking":
        result = { type: "thinking" as const, thinking: c.thinking, signature: c.signature };
        break;
      case "redacted_thinking":
        result = { type: "redacted_thinking" as const, data: c.data };
        break;
    }
    if (c.cacheControl) {
      const cc: Record<string, unknown> = { type: c.cacheControl.type };
      if (c.cacheControl.ttl) cc.ttl = c.cacheControl.ttl;
      result.cache_control = cc;
    }
    return result;
  });
}

export function fromAnthropicResponse(data: Record<string, unknown>): InternalResponse {
  const content = (data.content as Array<Record<string, unknown>>).map((block): InternalContent => {
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        id: block.id as string,
        name: block.name as string,
        input: block.input,
      };
    }
    if (block.type === "thinking") {
      return {
        type: "thinking",
        thinking: block.thinking as string,
        signature: block.signature as string,
      };
    }
    if (block.type === "redacted_thinking") {
      return { type: "redacted_thinking", data: block.data as string };
    }
    return { type: "text", text: block.text as string };
  });

  const usage = data.usage as Record<string, number>;
  return {
    content,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
    },
    model: data.model as string,
    stopReason: data.stop_reason as string,
  };
}

export function createAnthropicOutbound(): OutboundAdapter {
  return {
    async send(request, config) {
      const body = toAnthropicRequest({ ...request, stream: false });
      const base = config.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      const url = `${base}/v1/messages`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      return fromAnthropicResponse(data);
    },

    async *sendStream(request, config) {
      const body = toAnthropicRequest({ ...request, stream: true });
      const base = config.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      const url = `${base}/v1/messages`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }

      let model = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens: number | undefined;
      let cacheWriteTokens: number | undefined;
      let currentBlockType: string | undefined;
      let currentBlockId: string | undefined;
      let currentBlockName: string | undefined;
      let accumulatedThinking = "";
      let accumulatedSignature = "";

      for await (const sse of parseSSEStream(res)) {
        const parsed = JSON.parse(sse.data) as Record<string, unknown>;

        switch (sse.event) {
          case "message_start": {
            const msg = parsed.message as Record<string, unknown>;
            model = msg.model as string;
            const u = msg.usage as Record<string, number>;
            inputTokens = u.input_tokens ?? 0;
            cacheReadTokens = u.cache_read_input_tokens;
            cacheWriteTokens = u.cache_creation_input_tokens;
            break;
          }
          case "content_block_start": {
            const block = parsed.content_block as Record<string, unknown>;
            currentBlockType = block.type as string;
            if (currentBlockType === "tool_use") {
              currentBlockId = block.id as string;
              currentBlockName = block.name as string;
              yield {
                type: "content_delta",
                delta: {
                  type: "tool_use",
                  id: currentBlockId!,
                  name: currentBlockName!,
                  input_json_delta: "",
                },
              };
            } else if (currentBlockType === "thinking") {
              accumulatedThinking = "";
              accumulatedSignature = "";
            } else if (currentBlockType === "redacted_thinking") {
              yield {
                type: "content_delta",
                delta: {
                  type: "thinking",
                  thinking: "[redacted]",
                  signature: (block.data as string) ?? "",
                },
              };
            }
            break;
          }
          case "content_block_delta": {
            const delta = parsed.delta as Record<string, unknown>;
            if (delta.type === "text_delta") {
              yield {
                type: "content_delta",
                delta: { type: "text", text: delta.text as string },
              };
            } else if (delta.type === "input_json_delta") {
              yield {
                type: "content_delta",
                delta: {
                  type: "tool_use",
                  id: currentBlockId!,
                  name: currentBlockName!,
                  input_json_delta: delta.partial_json as string,
                },
              };
            } else if (delta.type === "thinking_delta") {
              accumulatedThinking += (delta.thinking as string) ?? "";
              yield {
                type: "content_delta",
                delta: { type: "thinking", thinking: delta.thinking as string, signature: "" },
              };
            } else if (delta.type === "signature_delta") {
              accumulatedSignature += (delta.signature as string) ?? "";
              yield {
                type: "content_delta",
                delta: {
                  type: "thinking",
                  thinking: "",
                  signature: delta.signature as string,
                },
              };
            }
            break;
          }
          case "message_delta": {
            const delta = parsed.delta as Record<string, unknown>;
            const u = parsed.usage as Record<string, number> | undefined;
            if (u) outputTokens = u.output_tokens ?? 0;
            yield {
              type: "usage",
              usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens },
            };
            yield {
              type: "stop",
              stopReason: delta.stop_reason as string,
              model,
            };
            break;
          }
        }
      }
    },
  };
}
