import type { FastifyInstance } from "fastify";
import type {
  InternalRequest,
  InternalContent,
  InternalMessage,
  InternalTool,
} from "../outbound/types";
import type { Relay } from "../relay";
import type { Router } from "../router";

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
}

interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema: unknown;
}

interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  system?: string | { type: string; text: string }[];
  max_tokens?: number;
  temperature?: number;
  tools?: AnthropicToolDef[];
  stream?: boolean;
}

function parseSystem(system: AnthropicRequestBody["system"]): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  return system.map((s) => s.text).join("\n");
}

function toInternalContent(block: AnthropicContentBlock): InternalContent {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text ?? "" };
    case "image": {
      if (block.source?.type === "base64") {
        return {
          type: "image",
          source: {
            type: "base64",
            mediaType: block.source.media_type ?? "image/png",
            data: block.source.data ?? "",
          },
        };
      }
      return { type: "image", source: { type: "url", url: block.source?.url ?? "" } };
    }
    case "tool_use":
      return { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: block.tool_use_id ?? "",
        content: block.content ?? "",
        isError: block.is_error,
      };
    default:
      return { type: "text", text: "" };
  }
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
  }));
}

function toAnthropicContent(c: InternalContent) {
  switch (c.type) {
    case "text":
      return { type: "text", text: c.text };
    case "tool_use":
      return { type: "tool_use", id: c.id, name: c.name, input: c.input };
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

    const internal: InternalRequest = {
      model: body.model,
      messages: body.messages.map(toInternalMessage),
      stream: !!body.stream,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      tools: toInternalTools(body.tools),
      systemPrompt: parseSystem(body.system),
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
    let activeBlockType: string | undefined;
    let currentToolUseId: string | undefined;

    function closeCurrentBlock() {
      if (blockIndex >= 0 && activeBlockType) {
        write("content_block_stop", { type: "content_block_stop", index: blockIndex });
        activeBlockType = undefined;
      }
    }

    for await (const event of result.stream) {
      switch (event.type) {
        case "content_delta": {
          if (event.delta.type === "text") {
            if (activeBlockType !== "text") {
              closeCurrentBlock();
              blockIndex = blockIndex < 0 ? 0 : blockIndex + 1;
              activeBlockType = "text";
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
          }
          break;
        }
        case "usage":
          outputTokens = event.usage.outputTokens;
          break;
        case "stop":
          closeCurrentBlock();
          write("message_delta", {
            type: "message_delta",
            delta: { stop_reason: event.stopReason },
            usage: { output_tokens: outputTokens },
          });
          break;
        case "error":
          write("error", { type: "error", error: { type: "server_error", message: event.error } });
          break;
      }
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
