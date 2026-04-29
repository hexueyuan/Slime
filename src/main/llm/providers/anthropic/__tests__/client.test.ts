import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnthropicClient } from "../client";
import { LLMError } from "../../../core/errors";
import type { StreamEvent } from "../../../core/types";

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

function makeSSEBody(lines: string[]): ReadableStream<Uint8Array> {
  const text = lines.join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

describe("AnthropicClient", () => {
  const client = new AnthropicClient({ baseURL: "https://api.anthropic.com", apiKey: "test-key" });

  it("sends correct POST request and yields stream events", async () => {
    const sseLines = [
      "event: content_block_delta",
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "hi" } })}`,
      "",
      "event: message_stop",
      `data: ${JSON.stringify({ type: "message_stop" })}`,
    ];
    mockFetch.mockResolvedValueOnce(new Response(makeSSEBody(sseLines), { status: 200 }));

    const gen = client.chat(
      [{ role: "user", content: "hello" }],
      {},
      { model: "claude-3-5-haiku-20241022" },
    );
    const events = await collect(gen);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-3-5-haiku-20241022");
    expect(body.stream).toBe(true);

    expect(events).toContainEqual({ type: "text", text: "hi" });
    expect(events).toContainEqual({ type: "done" });
  });

  it("throws LLMError on HTTP error response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    const gen = client.chat(
      [{ role: "user", content: "hi" }],
      {},
      { model: "claude-3-5-haiku-20241022" },
    );
    await expect(async () => {
      for await (const _ of gen) {
        /* drain */
      }
    }).rejects.toThrow(LLMError);

    try {
      const gen2 = client.chat(
        [{ role: "user", content: "hi" }],
        {},
        { model: "claude-3-5-haiku-20241022" },
      );
      mockFetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));
      for await (const _ of gen2) {
        /* drain */
      }
    } catch (e) {
      expect(e).toBeInstanceOf(LLMError);
      expect((e as LLMError).errorType).toBe("http_error");
      expect((e as LLMError).statusCode).toBe(401);
    }
  });

  it("throws LLMError with type aborted when signal is aborted", async () => {
    const controller = new AbortController();
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const gen = client.chat(
      [{ role: "user", content: "hi" }],
      {},
      { model: "claude-3-5-haiku-20241022" },
      controller.signal,
    );

    await expect(async () => {
      for await (const _ of gen) {
        /* drain */
      }
    }).rejects.toThrow(LLMError);

    try {
      mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
      const gen2 = client.chat(
        [{ role: "user", content: "hi" }],
        {},
        { model: "claude-3-5-haiku-20241022" },
        controller.signal,
      );
      for await (const _ of gen2) {
        /* drain */
      }
    } catch (e) {
      expect(e).toBeInstanceOf(LLMError);
      expect((e as LLMError).errorType).toBe("aborted");
    }
  });
});
