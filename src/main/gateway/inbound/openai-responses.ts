import type { FastifyInstance } from "fastify";
import type {
  InternalRequest,
  InternalContent,
  InternalMessage,
  InternalTool,
} from "../outbound/types";
import type { Relay } from "../relay";
import type { Router } from "../router";

interface OAIResponsesToolDef {
  type: string;
  name: string;
  description?: string;
  parameters?: unknown;
}

interface OAIContentPart {
  type: string;
  text?: string;
}

interface OAIInputMessage {
  type: "message";
  role: string;
  content: string | OAIContentPart[];
}

interface OAIFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

type OAIInputItem = OAIInputMessage | OAIFunctionCallOutput;

interface OAIResponsesRequestBody {
  model: string;
  input: string | OAIInputItem[];
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  tools?: OAIResponsesToolDef[];
}

function toInternalMessages(input: OAIResponsesRequestBody["input"]): InternalMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: [{ type: "text", text: input }] }];
  }
  return input.map((item) => {
    if (item.type === "function_call_output") {
      return {
        role: "tool" as const,
        content: [{ type: "tool_result" as const, toolUseId: item.call_id, content: item.output }],
      };
    }
    const msg = item as OAIInputMessage;
    const role = msg.role as InternalMessage["role"];
    if (typeof msg.content === "string") {
      return { role, content: [{ type: "text" as const, text: msg.content }] };
    }
    return {
      role,
      content: msg.content.map((p) => ({ type: "text" as const, text: p.text ?? "" })),
    };
  });
}

function toInternalTools(tools?: OAIResponsesToolDef[]): InternalTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools
    .filter((t) => t.type === "function")
    .map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    }));
}

function toOutputItems(content: InternalContent[]) {
  const output: unknown[] = [];
  const textParts: { type: string; text: string }[] = [];

  for (const c of content) {
    if (c.type === "text") {
      textParts.push({ type: "output_text", text: c.text });
    } else if (c.type === "tool_use") {
      // flush text as message before tool call
      if (textParts.length) {
        output.push({ type: "message", role: "assistant", content: [...textParts] });
        textParts.length = 0;
      }
      output.push({
        type: "function_call",
        id: `fc_${Date.now()}`,
        call_id: c.id,
        name: c.name,
        arguments: typeof c.input === "string" ? c.input : JSON.stringify(c.input),
      });
    }
  }
  if (textParts.length) {
    output.push({ type: "message", role: "assistant", content: [...textParts] });
  }
  return output;
}

export function registerOpenAIResponsesInbound(
  fastify: FastifyInstance,
  relay: Relay,
  router: Router,
): void {
  fastify.post("/v1/responses", async (request, reply) => {
    const body = request.body as OAIResponsesRequestBody;
    const respId = `resp_${Date.now()}`;

    if (request.allowedModels?.length && !request.allowedModels.includes(body.model)) {
      return reply.code(403).send({
        error: { type: "forbidden", message: `model not allowed: ${body.model}` },
      });
    }

    const internal: InternalRequest = {
      model: body.model,
      messages: toInternalMessages(body.input),
      stream: !!body.stream,
      maxTokens: body.max_output_tokens,
      temperature: body.temperature,
      tools: toInternalTools(body.tools),
      systemPrompt: body.instructions,
    };

    if (!body.stream) {
      const result = await relay.relay(internal);
      const resp = result.response;
      return reply.send({
        id: respId,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: resp.model,
        output: toOutputItems(resp.content),
        usage: {
          input_tokens: resp.usage.inputTokens,
          output_tokens: resp.usage.outputTokens,
          total_tokens: resp.usage.inputTokens + resp.usage.outputTokens,
        },
      });
    }

    // streaming
    const result = await relay.relayStream(internal);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const write = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    write("response.created", {
      type: "response.created",
      response: { id: respId, status: "in_progress", model: body.model },
    });

    let outputIndex = -1;
    let contentIndex = 0;
    let fullText = "";
    let outputTokens = 0;
    let inputTokens = 0;
    const outputItems: unknown[] = [];

    for await (const event of result.stream) {
      switch (event.type) {
        case "content_delta": {
          if (event.delta.type === "text") {
            if (outputIndex < 0) {
              outputIndex = 0;
              contentIndex = 0;
              write("response.output_item.added", {
                type: "response.output_item.added",
                output_index: outputIndex,
                item: { type: "message", role: "assistant" },
              });
              write("response.content_part.added", {
                type: "response.content_part.added",
                output_index: outputIndex,
                content_index: contentIndex,
                part: { type: "output_text", text: "" },
              });
            }
            fullText += event.delta.text;
            write("response.output_text.delta", {
              type: "response.output_text.delta",
              output_index: outputIndex,
              content_index: contentIndex,
              delta: event.delta.text,
            });
          } else if (event.delta.type === "tool_use") {
            // flush text message
            if (fullText) {
              write("response.output_text.done", {
                type: "response.output_text.done",
                output_index: outputIndex,
                content_index: contentIndex,
                text: fullText,
              });
              outputItems.push({
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: fullText }],
              });
              fullText = "";
            }
            outputIndex++;
            write("response.output_item.added", {
              type: "response.output_item.added",
              output_index: outputIndex,
              item: {
                type: "function_call",
                id: `fc_${Date.now()}`,
                call_id: event.delta.id,
                name: event.delta.name,
              },
            });
          }
          break;
        }
        case "usage":
          inputTokens = event.usage.inputTokens;
          outputTokens = event.usage.outputTokens;
          break;
        case "stop": {
          if (fullText) {
            write("response.output_text.done", {
              type: "response.output_text.done",
              output_index: Math.max(outputIndex, 0),
              content_index: contentIndex,
              text: fullText,
            });
            outputItems.push({
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: fullText }],
            });
          }
          break;
        }
        case "error":
          write("response.failed", {
            type: "response.failed",
            error: { type: "server_error", message: event.error },
          });
          break;
      }
    }

    write("response.completed", {
      type: "response.completed",
      response: {
        id: respId,
        status: "completed",
        model: body.model,
        output: outputItems,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      },
    });
    reply.raw.end();
  });

  fastify.get("/v1/responses/models", async (_request, reply) => {
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
