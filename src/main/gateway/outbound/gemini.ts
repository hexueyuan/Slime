import type {
  InternalRequest,
  InternalResponse,
  InternalContent,
  InternalMessage,
  OutboundAdapter,
} from "./types";
import { httpRequest, parseSSEStream } from "./base";

export function toGeminiRequest(req: InternalRequest) {
  const contents: Record<string, unknown>[] = [];

  for (const msg of req.messages) {
    if (msg.role === "system") continue;

    const role = msg.role === "assistant" ? "model" : "user";
    const parts = convertParts(msg);
    if (parts.length) contents.push({ role, parts });
  }

  const body: Record<string, unknown> = { contents };

  // system prompt
  const systemText = buildSystemText(req);
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  // generation config
  const genConfig: Record<string, unknown> = {};
  if (req.maxTokens !== undefined) genConfig.maxOutputTokens = req.maxTokens;
  if (req.temperature !== undefined) genConfig.temperature = req.temperature;
  if (Object.keys(genConfig).length) body.generationConfig = genConfig;

  // tools
  if (req.tools?.length) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      },
    ];
  }

  return body;
}

function buildSystemText(req: InternalRequest): string | undefined {
  const parts: string[] = [];
  if (req.systemPrompt) parts.push(req.systemPrompt);
  for (const msg of req.messages) {
    if (msg.role === "system") {
      const text = msg.content
        .filter((c): c is Extract<InternalContent, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (text) parts.push(text);
    }
  }
  return parts.length ? parts.join("\n") : undefined;
}

function convertParts(msg: InternalMessage): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  for (const c of msg.content) {
    switch (c.type) {
      case "text":
        parts.push({ text: c.text });
        break;
      case "image":
        if (c.source.type === "base64") {
          parts.push({ inlineData: { mimeType: c.source.mediaType, data: c.source.data } });
        }
        break;
      case "tool_use":
        parts.push({ functionCall: { name: c.name, args: c.input } });
        break;
      case "tool_result":
        parts.push({
          functionResponse: { name: c.toolUseId, response: { result: c.content } },
        });
        break;
    }
  }
  return parts;
}

export function fromGeminiResponse(data: Record<string, unknown>): InternalResponse {
  const candidates = data.candidates as Array<Record<string, unknown>>;
  const candidate = candidates[0];
  const candidateContent = candidate.content as Record<string, unknown>;
  const parts = candidateContent.parts as Array<Record<string, unknown>>;
  const content: InternalContent[] = [];

  for (const p of parts) {
    if (p.text !== undefined) {
      content.push({ type: "text", text: p.text as string });
    } else if (p.functionCall) {
      const fc = p.functionCall as Record<string, unknown>;
      content.push({
        type: "tool_use",
        id: `gemini-${fc.name}`,
        name: fc.name as string,
        input: fc.args,
      });
    }
  }

  const usage = data.usageMetadata as Record<string, number> | undefined;
  return {
    content,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      cacheReadTokens: usage?.cachedContentTokenCount,
    },
    model: (data.modelVersion as string) ?? "",
    stopReason: (candidate.finishReason as string) ?? "STOP",
  };
}

export function createGeminiOutbound(): OutboundAdapter {
  return {
    async send(request, config) {
      const body = toGeminiRequest({ ...request, stream: false });
      const base = config.baseUrl.replace(/\/$/, "");
      const url = `${base}/v1beta/models/${request.model}:generateContent`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini ${res.status}: ${text}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      return fromGeminiResponse(data);
    },

    async *sendStream(request, config) {
      const body = toGeminiRequest({ ...request, stream: true });
      const base = config.baseUrl.replace(/\/$/, "");
      const url = `${base}/v1beta/models/${request.model}:streamGenerateContent?alt=sse`;
      const res = await httpRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
        timeout: config.timeout,
      });
      if (!res.ok) {
        const text = await res.text();
        yield { type: "error" as const, error: `Gemini ${res.status}: ${text}` };
        return;
      }

      let lastText = "";

      for await (const sse of parseSSEStream(res)) {
        const parsed = JSON.parse(sse.data) as Record<string, unknown>;
        const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;

        if (candidates?.length) {
          const candidateContent = candidates[0].content as Record<string, unknown> | undefined;
          const parts = (candidateContent?.parts as Array<Record<string, unknown>>) ?? [];

          for (const p of parts) {
            if (p.text !== undefined) {
              const text = p.text as string;
              // Gemini SSE sends cumulative text; emit only the delta
              if (text.startsWith(lastText)) {
                const delta = text.slice(lastText.length);
                if (delta) {
                  yield { type: "content_delta", delta: { type: "text", text: delta } };
                }
                lastText = text;
              } else {
                // non-cumulative chunk, emit as-is
                yield { type: "content_delta", delta: { type: "text", text } };
                lastText = text;
              }
            } else if (p.functionCall) {
              const fc = p.functionCall as Record<string, unknown>;
              yield {
                type: "content_delta",
                delta: {
                  type: "tool_use",
                  id: `gemini-${fc.name}`,
                  name: fc.name as string,
                  input_json_delta: JSON.stringify(fc.args),
                },
              };
            }
          }

          const finishReason = candidates[0].finishReason as string | undefined;
          if (finishReason) {
            yield { type: "stop", stopReason: finishReason, model: request.model };
          }
        }

        const usage = parsed.usageMetadata as Record<string, number> | undefined;
        if (usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
              cacheReadTokens: usage.cachedContentTokenCount,
            },
          };
        }
      }
    },
  };
}
