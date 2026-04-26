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
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "tool" ? ("user" as const) : m.role,
      content: convertContent(m),
    }));

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
  };

  if (system) body.system = system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.stream) body.stream = true;

  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  return body;
}

function convertContent(msg: InternalMessage) {
  return msg.content.map((c) => {
    switch (c.type) {
      case "text":
        return { type: "text" as const, text: c.text };
      case "image":
        return { type: "image" as const, source: c.source };
      case "tool_use":
        return { type: "tool_use" as const, id: c.id, name: c.name, input: c.input };
      case "tool_result":
        return {
          type: "tool_result" as const,
          tool_use_id: c.toolUseId,
          content: c.content,
          is_error: c.isError,
        };
    }
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
        yield { type: "error" as const, error: `Anthropic ${res.status}: ${text}` };
        return;
      }

      let model = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens: number | undefined;
      let cacheWriteTokens: number | undefined;
      let currentBlockType: string | undefined;
      let currentBlockId: string | undefined;
      let currentBlockName: string | undefined;

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
