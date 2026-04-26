import type { InternalRequest, InternalResponse, InternalContent, OutboundAdapter } from "./types";
import { httpRequest, parseSSEStream } from "./base";

export function toOpenAIRequest(req: InternalRequest) {
  const messages: Record<string, unknown>[] = [];

  if (req.systemPrompt) {
    messages.push({ role: "system", content: req.systemPrompt });
  }

  for (const msg of req.messages) {
    if (msg.role === "system") {
      messages.push({ role: "system", content: textFromContent(msg.content) });
      continue;
    }

    if (msg.role === "tool") {
      for (const c of msg.content) {
        if (c.type === "tool_result") {
          messages.push({ role: "tool", tool_call_id: c.toolUseId, content: c.content });
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      const toolCalls: Record<string, unknown>[] = [];
      let text = "";

      for (const c of msg.content) {
        if (c.type === "text") {
          text += c.text;
        } else if (c.type === "tool_use") {
          toolCalls.push({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          });
        }
      }

      const m: Record<string, unknown> = { role: "assistant" };
      if (text) m.content = text;
      if (toolCalls.length) m.tool_calls = toolCalls;
      messages.push(m);
      continue;
    }

    // user
    const parts = msg.content.map((c) => {
      if (c.type === "text") return { type: "text" as const, text: c.text };
      if (c.type === "image") {
        const url =
          c.source.type === "url"
            ? c.source.url
            : `data:${c.source.mediaType};base64,${c.source.data}`;
        return { type: "image_url" as const, image_url: { url } };
      }
      return { type: "text" as const, text: "" };
    });

    if (parts.length === 1 && parts[0].type === "text") {
      messages.push({ role: "user", content: parts[0].text });
    } else {
      messages.push({ role: "user", content: parts });
    }
  }

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
  };

  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  return body;
}

function textFromContent(content: InternalContent[]): string {
  return content
    .filter((c): c is Extract<InternalContent, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export function fromOpenAIResponse(data: Record<string, unknown>): InternalResponse {
  const choices = data.choices as Array<Record<string, unknown>>;
  const choice = choices[0];
  const msg = choice.message as Record<string, unknown>;
  const content: InternalContent[] = [];

  if (msg.content) {
    content.push({ type: "text", text: msg.content as string });
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls as Array<Record<string, unknown>>) {
      const fn = tc.function as Record<string, string>;
      content.push({
        type: "tool_use",
        id: tc.id as string,
        name: fn.name,
        input: JSON.parse(fn.arguments),
      });
    }
  }

  const usage = data.usage as Record<string, number>;
  return {
    content,
    usage: {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
    },
    model: data.model as string,
    stopReason: (choice.finish_reason as string) ?? "stop",
  };
}

export function createOpenAIChatOutbound(): OutboundAdapter {
  return {
    async send(request, config) {
      const body = toOpenAIRequest({ ...request, stream: false });
      const base = config.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      const url = `${base}/v1/chat/completions`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      return fromOpenAIResponse(data);
    },

    async *sendStream(request, config) {
      const body = toOpenAIRequest({ ...request, stream: true });
      const base = config.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
      const url = `${base}/v1/chat/completions`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        yield { type: "error" as const, error: `OpenAI ${res.status}: ${text}` };
        return;
      }

      let model = "";
      let finishReason = "";
      // accumulate tool call deltas by index
      const toolCalls = new Map<number, { id: string; name: string; args: string }>();

      for await (const sse of parseSSEStream(res)) {
        const parsed = JSON.parse(sse.data) as Record<string, unknown>;
        if (parsed.model) model = parsed.model as string;

        const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
        if (choices?.length) {
          const delta = choices[0].delta as Record<string, unknown> | undefined;
          const reason = choices[0].finish_reason as string | null;

          if (delta?.content) {
            yield {
              type: "content_delta",
              delta: { type: "text", text: delta.content as string },
            };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
              const idx = tc.index as number;
              const fn = tc.function as Record<string, string> | undefined;
              let entry = toolCalls.get(idx);
              if (!entry) {
                entry = { id: (tc.id as string) ?? "", name: fn?.name ?? "", args: "" };
                toolCalls.set(idx, entry);
                yield {
                  type: "content_delta",
                  delta: {
                    type: "tool_use",
                    id: entry.id,
                    name: entry.name,
                    input_json_delta: "",
                  },
                };
              }
              if (fn?.arguments) {
                entry.args += fn.arguments;
                yield {
                  type: "content_delta",
                  delta: {
                    type: "tool_use",
                    id: entry.id,
                    name: entry.name,
                    input_json_delta: fn.arguments,
                  },
                };
              }
            }
          }

          if (reason) finishReason = reason;
        }

        const usage = parsed.usage as Record<string, number> | undefined;
        if (usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: usage.prompt_tokens ?? 0,
              outputTokens: usage.completion_tokens ?? 0,
            },
          };
        }
      }

      if (finishReason || model) {
        yield { type: "stop", stopReason: finishReason || "stop", model };
      }
    },
  };
}
