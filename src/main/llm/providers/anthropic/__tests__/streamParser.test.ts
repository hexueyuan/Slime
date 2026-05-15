import { describe, expect, it } from "vitest";
import { parseAnthropicStream } from "../streamParser";
import type { SSEEvent } from "../../../core/sseParser";
import type { StreamEvent } from "../../../core/types";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

async function* makeSSE(events: SSEEvent[]): AsyncGenerator<SSEEvent> {
  for (const e of events) yield e;
}

describe("parseAnthropicStream", () => {
  it("text delta → text event", async () => {
    const sse = makeSSE([
      {
        event: "content_block_delta",
        data: JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "hello" },
        }),
      },
    ]);
    const events = await collect(parseAnthropicStream(sse));
    expect(events).toEqual([{ type: "text", text: "hello" }]);
  });

  it("tool_use blocks accumulate and emit tool_call_start/delta/end", async () => {
    const sse = makeSSE([
      {
        event: "content_block_start",
        data: JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "id1", name: "my_tool" },
        }),
      },
      {
        event: "content_block_delta",
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"k"' },
        }),
      },
      {
        event: "content_block_delta",
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: ':"v"}' },
        }),
      },
      {
        event: "content_block_stop",
        data: JSON.stringify({ type: "content_block_stop", index: 0 }),
      },
    ]);
    const events = await collect(parseAnthropicStream(sse));
    expect(events[0]).toEqual({ type: "tool_call_start", id: "id1", name: "my_tool" });
    expect(events[1]).toEqual({ type: "tool_call_delta", id: "id1", delta: '{"k"' });
    expect(events[2]).toEqual({ type: "tool_call_delta", id: "id1", delta: ':"v"}' });
    expect(events[3]).toEqual({ type: "tool_call_end", id: "id1", input: { k: "v" } });
  });

  it("invalid JSON in tool_call_end → error event", async () => {
    const sse = makeSSE([
      {
        event: "content_block_start",
        data: JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "id2", name: "bad_tool" },
        }),
      },
      {
        event: "content_block_delta",
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "{INVALID" },
        }),
      },
      {
        event: "content_block_stop",
        data: JSON.stringify({ type: "content_block_stop", index: 0 }),
      },
    ]);
    const events = await collect(parseAnthropicStream(sse));
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { type: "error"; error: string }).error).toContain("JSON");
    expect(events.find((e) => e.type === "tool_call_end")).toBeUndefined();
  });
});
