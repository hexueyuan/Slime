import type { SSEEvent } from "../../core/sseParser";
import type { StreamEvent } from "../../core/types";
import type { AnthropicSSEPayload } from "./types";

export async function* parseAnthropicStream(
  sseGen: AsyncGenerator<SSEEvent>,
): AsyncGenerator<StreamEvent> {
  // Map from block index to { id, name, accumulated json }
  const toolCalls = new Map<number, { id: string; name: string; json: string }>();
  // Map from block index to { thinking, signature }
  const thinkingBlocks = new Map<number, { thinking: string; signature: string }>();

  for await (const { event, data } of sseGen) {
    let payload: AnthropicSSEPayload;
    try {
      payload = JSON.parse(data) as AnthropicSSEPayload;
    } catch {
      continue;
    }

    const type = event ?? payload.type;

    if (type === "content_block_start") {
      if (payload.content_block?.type === "tool_use") {
        const { id, name } = payload.content_block;
        if (id && name) {
          const idx = payload.index ?? 0;
          toolCalls.set(idx, { id, name, json: "" });
          yield { type: "tool_call_start", id, name };
        }
      } else if (payload.content_block?.type === "thinking") {
        thinkingBlocks.set(payload.index ?? 0, { thinking: "", signature: "" });
        yield { type: "thinking_start" };
      } else if (payload.content_block?.type === "redacted_thinking") {
        yield {
          type: "thinking_end",
          thinking: "[redacted]",
          signature: (payload.content_block.data as string) ?? "",
        };
      }
    } else if (type === "content_block_delta") {
      const delta = payload.delta;
      if (!delta) continue;

      if (delta.type === "text_delta" && delta.text !== undefined) {
        yield { type: "text", text: delta.text };
      } else if (delta.type === "input_json_delta" && delta.partial_json !== undefined) {
        const idx = payload.index ?? 0;
        const tc = toolCalls.get(idx);
        if (tc) {
          tc.json += delta.partial_json;
          yield { type: "tool_call_delta", id: tc.id, delta: delta.partial_json };
        }
      } else if (delta.type === "thinking_delta" && delta.thinking !== undefined) {
        const tb = thinkingBlocks.get(payload.index ?? 0);
        if (tb) {
          tb.thinking += delta.thinking;
          yield { type: "thinking_delta", text: delta.thinking };
        }
      } else if (delta.type === "signature_delta" && delta.signature !== undefined) {
        const tb = thinkingBlocks.get(payload.index ?? 0);
        if (tb) {
          tb.signature += delta.signature;
          yield { type: "signature_delta", signature: delta.signature };
        }
      }
    } else if (type === "content_block_stop") {
      const idx = payload.index ?? 0;
      const tc = toolCalls.get(idx);
      if (tc) {
        let input: unknown;
        try {
          input = JSON.parse(tc.json || "{}");
        } catch (e) {
          yield {
            type: "error",
            error: `Tool call ${tc.id} JSON invalid: ${(e as Error).message}`,
          };
          toolCalls.delete(idx);
          continue;
        }
        yield { type: "tool_call_end", id: tc.id, input };
        toolCalls.delete(idx);
      }
      const tb = thinkingBlocks.get(idx);
      if (tb) {
        yield { type: "thinking_end", thinking: tb.thinking, signature: tb.signature };
        thinkingBlocks.delete(idx);
      }
    } else if (type === "message_delta" && payload.usage) {
      const u = payload.usage;
      yield {
        type: "usage",
        usage: {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          ...(u.cache_read_input_tokens !== undefined && {
            cacheReadTokens: u.cache_read_input_tokens,
          }),
          ...(u.cache_creation_input_tokens !== undefined && {
            cacheWriteTokens: u.cache_creation_input_tokens,
          }),
        },
      };
    } else if (type === "message_stop") {
      yield { type: "done" };
    } else if (type === "error" && payload.error) {
      yield { type: "error", error: payload.error.message ?? "unknown error" };
    }
  }
}
