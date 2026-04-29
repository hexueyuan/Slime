import { describe, it, expect } from "vitest";
import { parseSSE } from "@/llm/core/sseParser";

function createMockResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("parseSSE", () => {
  it("should parse simple event", async () => {
    const response = createMockResponse(['data: {"hello":"world"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"hello":"world"}' }]);
  });

  it("should parse event with event type", async () => {
    const response = createMockResponse(["event: message_start\n", 'data: {"type":"start"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ event: "message_start", data: '{"type":"start"}' }]);
  });

  it("should handle incomplete lines across chunks", async () => {
    const response = createMockResponse(['data: {"hel', 'lo":"world"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"hello":"world"}' }]);
  });

  it("should stop at [DONE]", async () => {
    const response = createMockResponse([
      'data: {"msg":"first"}\n\n',
      "data: [DONE]\n\n",
      'data: {"msg":"after"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"msg":"first"}' }]);
  });

  it("should handle incomplete data at stream end", async () => {
    const response = createMockResponse([
      'data: {"text":"你好', // 故意没有 \n\n
    ]);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"text":"你好', event: undefined }]);
  });

  it("should handle UTF-8 multibyte characters", async () => {
    // Test UTF-8 multibyte character handling
    const response = createMockResponse(['data: {"text":"你好"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events.length).toBe(1);
    expect(events[0].data).toContain("你好");
  });
});
