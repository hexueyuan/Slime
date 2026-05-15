import type { FastifyInstance } from "fastify";
import type {
  InternalRequest,
  InternalContent,
  InternalMessage,
  InternalTool,
  SystemTextPart,
} from "../outbound/types";
import type { Relay } from "../relay";
import type { Router } from "../router";
import { logger } from "../../utils/logger";

interface AnthropicMessage {
  role: string;
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  source?: { type: string; media_type?: string; data?: string; url?: string };
  cache_control?: { type: string; ttl?: string };
  thinking?: string;
  signature?: string;
  data?: string;
}

interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema: unknown;
  cache_control?: { type: string; ttl?: string };
}

interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  system?:
    | string
    | { type: string; text: string; cache_control?: { type: string; ttl?: string } }[];
  max_tokens?: number;
  temperature?: number;
  tools?: AnthropicToolDef[];
  stream?: boolean;
  cache_control?: { type: string; ttl?: string };
  thinking?: { type: string; budget_tokens?: number };
}

function parseSystem(system: AnthropicRequestBody["system"]): {
  systemPrompt?: string;
  systemParts?: SystemTextPart[];
} {
  if (!system) return {};
  if (typeof system === "string") return { systemPrompt: system };

  const hasCacheControl = system.some((s) => s.cache_control);
  if (!hasCacheControl) {
    return { systemPrompt: system.map((s) => s.text).join("\n") };
  }

  return {
    systemPrompt: system.map((s) => s.text).join("\n"),
    systemParts: system.map((s) => ({
      type: "text" as const,
      text: s.text,
      ...(s.cache_control
        ? { cacheControl: { type: "ephemeral" as const, ttl: s.cache_control.ttl } }
        : {}),
    })),
  };
}

function toInternalContent(block: AnthropicContentBlock): InternalContent {
  let result: InternalContent;
  switch (block.type) {
    case "text":
      result = { type: "text", text: block.text ?? "" };
      break;
    case "image": {
      if (block.source?.type === "base64") {
        result = {
          type: "image",
          source: {
            type: "base64",
            mediaType: block.source.media_type ?? "image/png",
            data: block.source.data ?? "",
          },
        };
      } else {
        result = { type: "image", source: { type: "url", url: block.source?.url ?? "" } };
      }
      break;
    }
    case "tool_use":
      result = { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input };
      break;
    case "tool_result":
      result = {
        type: "tool_result",
        toolUseId: block.tool_use_id ?? "",
        content: block.content ?? "",
        isError: block.is_error,
      };
      break;
    case "thinking":
      result = {
        type: "thinking",
        thinking: block.thinking ?? "",
        signature: block.signature ?? "",
      };
      break;
    case "redacted_thinking":
      result = { type: "redacted_thinking", data: block.data ?? "" };
      break;
    default:
      result = { type: "text", text: "" };
  }
  if (block.cache_control) {
    result = {
      ...result,
      cacheControl: { type: "ephemeral" as const, ttl: block.cache_control.ttl },
    };
  }
  return result;
}

function toInternalMessage(msg: AnthropicMessage): InternalMessage {
  const role = msg.role as InternalMessage["role"];
  if (typeof msg.content === "string") {
    return { role, content: [{ type: "text", text: msg.content }] };
  }
  return { role, content: msg.content.map(toInternalContent) };
}

function toInternalTools(tools?: AnthropicToolDef[]): InternalTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
    cacheControl: t.cache_control
      ? { type: "ephemeral" as const, ttl: t.cache_control.ttl }
      : undefined,
  }));
}

function toAnthropicContent(c: InternalContent) {
  switch (c.type) {
    case "text":
      return { type: "text", text: c.text };
    case "tool_use":
      return { type: "tool_use", id: c.id, name: c.name, input: c.input };
    case "thinking":
      return { type: "thinking", thinking: c.thinking, signature: c.signature };
    case "redacted_thinking":
      return { type: "redacted_thinking", data: c.data };
    default:
      return { type: "text", text: "" };
  }
}

export function registerAnthropicInbound(
  fastify: FastifyInstance,
  relay: Relay,
  router: Router,
): void {
  fastify.post("/v1/messages", async (request, reply) => {
    const body = request.body as AnthropicRequestBody;

    if (request.allowedModels?.length && !request.allowedModels.includes(body.model)) {
      return reply.code(403).send({
        error: { type: "forbidden", message: `model not allowed: ${body.model}` },
      });
    }

    const { systemPrompt, systemParts } = parseSystem(body.system);

    const internal: InternalRequest = {
      model: body.model,
      messages: body.messages.map(toInternalMessage),
      stream: !!body.stream,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      tools: toInternalTools(body.tools),
      systemPrompt,
      systemParts,
      cacheControl: body.cache_control
        ? { type: "ephemeral" as const, ttl: body.cache_control.ttl }
        : undefined,
      thinking: body.thinking as { type: "enabled"; budget_tokens: number } | undefined,
      rawBody: JSON.stringify(body),
      apiKeyId: request.apiKeyId,
    };

    if (!body.stream) {
      const result = await relay.relay(internal);
      const resp = result.response;
      return reply.send({
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        content: resp.content.map(toAnthropicContent),
        model: resp.model,
        stop_reason: resp.stopReason,
        usage: {
          input_tokens: resp.usage.inputTokens,
          output_tokens: resp.usage.outputTokens,
          cache_read_input_tokens: resp.usage.cacheReadTokens ?? 0,
          cache_creation_input_tokens: resp.usage.cacheWriteTokens ?? 0,
        },
      });
    }

    // streaming
    const result = await relay.relayStream(internal);
    const msgId = `msg_${Date.now()}`;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const write = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    write("message_start", {
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        model: body.model,
        usage: { input_tokens: 0 },
      },
    });

    let blockIndex = -1;
    let outputTokens = 0;
    let inputTokens = 0;
    let cacheReadTokens: number | undefined;
    let cacheWriteTokens: number | undefined;
    let activeBlockType: string | undefined;
    let currentToolUseId: string | undefined;
    let thinkingOpened = false;

    function closeCurrentBlock() {
      if (blockIndex >= 0 && activeBlockType) {
        write("content_block_stop", { type: "content_block_stop", index: blockIndex });
        activeBlockType = undefined;
        thinkingOpened = false;
      }
    }

    try {
      for await (const event of result.stream) {
        switch (event.type) {
          case "content_delta": {
            if (event.delta.type === "text") {
              if (activeBlockType !== "text") {
                closeCurrentBlock();
                blockIndex = blockIndex < 0 ? 0 : blockIndex + 1;
                activeBlockType = "text";
                thinkingOpened = false;
                write("content_block_start", {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: { type: "text", text: "" },
                });
              }
              write("content_block_delta", {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "text_delta", text: event.delta.text },
              });
            } else if (event.delta.type === "tool_use") {
              if (event.delta.id !== currentToolUseId) {
                closeCurrentBlock();
                blockIndex = blockIndex < 0 ? 0 : blockIndex + 1;
                activeBlockType = "tool_use";
                currentToolUseId = event.delta.id;
                thinkingOpened = false;
                write("content_block_start", {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: {
                    type: "tool_use",
                    id: event.delta.id,
                    name: event.delta.name,
                    input: {},
                  },
                });
              }
              if (event.delta.input_json_delta) {
                write("content_block_delta", {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: { type: "input_json_delta", partial_json: event.delta.input_json_delta },
                });
              }
            } else if (event.delta.type === "thinking") {
              if (!thinkingOpened) {
                closeCurrentBlock();
                blockIndex = blockIndex < 0 ? 0 : blockIndex + 1;
                activeBlockType = "thinking";
                thinkingOpened = true;
                write("content_block_start", {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: { type: "thinking", thinking: "", signature: "" },
                });
              }
              if (event.delta.thinking) {
                write("content_block_delta", {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: { type: "thinking_delta", thinking: event.delta.thinking },
                });
              }
              if (event.delta.signature) {
                write("content_block_delta", {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: { type: "signature_delta", signature: event.delta.signature },
                });
              }
            }
            break;
          }
          case "usage":
            outputTokens = event.usage.outputTokens;
            inputTokens = event.usage.inputTokens;
            cacheReadTokens = event.usage.cacheReadTokens;
            cacheWriteTokens = event.usage.cacheWriteTokens;
            break;
          case "stop":
            closeCurrentBlock();
            write("message_delta", {
              type: "message_delta",
              delta: { stop_reason: event.stopReason },
              usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                ...(cacheReadTokens !== undefined && { cache_read_input_tokens: cacheReadTokens }),
                ...(cacheWriteTokens !== undefined && {
                  cache_creation_input_tokens: cacheWriteTokens,
                }),
              },
            });
            break;
          case "error":
            write("error", {
              type: "error",
              error: { type: "server_error", message: event.error },
            });
            break;
        }
      }
    } catch (err) {
      logger.debug("[gateway/anthropic] stream error", { error: String(err) });
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
      return;
    }

    write("message_stop", { type: "message_stop" });
    reply.raw.end();
  });

  fastify.get("/v1/models", async (_request, reply) => {
    const names = router.listGroupNames();
    return reply.send({
      data: names.map((name) => ({
        id: name,
        object: "model",
        created: 0,
        owned_by: "slime-gateway",
      })),
    });
  });
}
