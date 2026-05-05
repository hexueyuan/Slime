import type BetterSqlite3 from "better-sqlite3";
import type { InternalRequest, InternalResponse, StreamEvent } from "./outbound/types";
import type { Router } from "./router";
import type { Balancer } from "./balancer";
import type { CircuitBreaker } from "./circuit";
import type { KeyPool } from "./keypool";
import { getChannel, listChannelKeys } from "@/db/models/channelDao";
import { getAdapter } from "./outbound/registry";

export interface RelayDeps {
  db: BetterSqlite3.Database;
  router: Router;
  balancer: Balancer;
  circuitBreaker: CircuitBreaker;
  keyPool: KeyPool;
}

export interface RelayResult {
  response: InternalResponse;
  channelId: number;
  channelName: string;
  keyId: number;
  modelName: string;
  durationMs: number;
}

export interface RelayStreamResult {
  stream: AsyncIterable<StreamEvent>;
  channelId: number;
  channelName: string;
  keyId: number;
  modelName: string;
  startTime: number;
}

export type StatsCallback = (data: {
  groupName: string;
  channelId: number;
  channelName: string;
  modelName: string;
  apiKeyId?: number;
  usage: InternalResponse["usage"];
  durationMs: number;
  status: "success" | "error";
  error?: string;
  requestBody?: string;
  rawRequestBody?: string;
  responseBody?: string;
  ttftMs?: number | null;
}) => void;

export interface Relay {
  relay(request: InternalRequest): Promise<RelayResult>;
  relayStream(request: InternalRequest): Promise<RelayStreamResult>;
  onStats(callback: StatsCallback): void;
}

function filterForLog(request: InternalRequest): string {
  const { rawBody: _rawBody, rawHeaders: _rawHeaders, apiKeyId: _apiKeyId, ...rest } = request;
  const filtered = {
    ...rest,
    messages: request.messages.map((msg) => ({
      ...msg,
      content: msg.content.map((c) => {
        if (c.type === "image") {
          return {
            type: "image" as const,
            source: { type: "url" as const, url: "[image data omitted]" },
          };
        }
        return c;
      }),
    })),
  };
  return JSON.stringify(filtered);
}

export function createRelay(deps: RelayDeps): Relay {
  let statsCallback: StatsCallback | undefined;

  function resolveAndSort(model: string) {
    const resolved = deps.router.resolve(model);
    if (!resolved) throw new Error(`model not found: ${model}`);
    const sorted = deps.balancer.sort(resolved.items, resolved.group.balanceMode);
    return { group: resolved.group, items: sorted };
  }

  function is429(err: unknown): boolean {
    if (err instanceof Error) {
      return err.message.includes("429") || err.message.includes("rate limit");
    }
    return false;
  }

  return {
    async relay(request) {
      const { group, items } = resolveAndSort(request.model);
      let lastError: Error | undefined;

      for (const item of items) {
        const channel = getChannel(deps.db, item.channelId);
        if (!channel || !channel.enabled) continue;

        const keys = listChannelKeys(deps.db, item.channelId);
        const selectedKey = deps.keyPool.selectKey(
          keys,
          item.channelId,
          item.modelName,
          deps.circuitBreaker,
        );
        if (!selectedKey) continue;

        const adapter = getAdapter(channel.type);
        const config = {
          baseUrl: channel.baseUrl,
          apiKey: selectedKey.key,
          timeout: channel.timeout,
        };

        const start = Date.now();
        try {
          const outboundRequest = { ...request, model: item.modelName };
          const response = await adapter.send(outboundRequest, config);
          const durationMs = Date.now() - start;
          deps.circuitBreaker.recordSuccess(item.channelId, selectedKey.id, item.modelName);

          // 构建实际发送的请求体用于日志记录
          let outboundRequestBody: string;
          try {
            if (channel.type === "anthropic") {
              const toAnthropicRequest = require("./outbound/anthropic").toAnthropicRequest;
              outboundRequestBody = JSON.stringify(
                toAnthropicRequest({ ...outboundRequest, stream: false }),
              );
            } else {
              outboundRequestBody = filterForLog(outboundRequest);
            }
          } catch {
            // 日志构建失败时 fallback 到基本格式
            outboundRequestBody = filterForLog(outboundRequest);
          }

          statsCallback?.({
            groupName: group.name,
            channelId: channel.id,
            channelName: channel.name,
            modelName: item.modelName,
            apiKeyId: request.apiKeyId,
            usage: response.usage,
            durationMs,
            status: "success",
            requestBody: outboundRequestBody,
            rawRequestBody: request.rawBody,
            responseBody: JSON.stringify(response),
          });
          return {
            response,
            channelId: channel.id,
            channelName: channel.name,
            keyId: selectedKey.id,
            modelName: item.modelName,
            durationMs,
          };
        } catch (err) {
          const durationMs = Date.now() - start;
          lastError = err instanceof Error ? err : new Error(String(err));
          deps.circuitBreaker.recordFailure(item.channelId, selectedKey.id, item.modelName);
          if (is429(err)) {
            deps.keyPool.mark429(item.channelId, selectedKey.id);
          }

          // 构建实际发送的请求体用于日志记录
          const outboundRequest = { ...request, model: item.modelName };
          let outboundRequestBody: string;
          try {
            if (channel.type === "anthropic") {
              const toAnthropicRequest = require("./outbound/anthropic").toAnthropicRequest;
              outboundRequestBody = JSON.stringify(
                toAnthropicRequest({ ...outboundRequest, stream: false }),
              );
            } else {
              outboundRequestBody = filterForLog(outboundRequest);
            }
          } catch {
            // 日志构建失败时 fallback 到基本格式
            outboundRequestBody = filterForLog(outboundRequest);
          }

          statsCallback?.({
            groupName: group.name,
            channelId: channel.id,
            channelName: channel.name,
            modelName: item.modelName,
            apiKeyId: request.apiKeyId,
            usage: { inputTokens: 0, outputTokens: 0 },
            durationMs,
            status: "error",
            error: lastError.message,
            requestBody: outboundRequestBody,
            rawRequestBody: request.rawBody,
          });
        }
      }

      throw lastError ?? new Error(`all candidates exhausted for model: ${request.model}`);
    },

    async relayStream(request) {
      const { group, items } = resolveAndSort(request.model);
      let lastError: Error | undefined;

      for (const item of items) {
        const channel = getChannel(deps.db, item.channelId);
        if (!channel || !channel.enabled) continue;

        const keys = listChannelKeys(deps.db, item.channelId);
        const selectedKey = deps.keyPool.selectKey(
          keys,
          item.channelId,
          item.modelName,
          deps.circuitBreaker,
        );
        if (!selectedKey) continue;

        const adapter = getAdapter(channel.type);
        const config = {
          baseUrl: channel.baseUrl,
          apiKey: selectedKey.key,
          timeout: channel.timeout,
        };

        const startTime = Date.now();
        try {
          const outboundRequest = { ...request, model: item.modelName };
          const stream = adapter.sendStream(outboundRequest, config);
          // 尝试拉取第一个 chunk 确认连接成功
          const iterator = stream[Symbol.asyncIterator]();
          const first = await iterator.next();

          deps.circuitBreaker.recordSuccess(item.channelId, selectedKey.id, item.modelName);

          // 构建实际发送的请求体用于日志记录
          let outboundRequestBody: string;
          try {
            if (channel.type === "anthropic") {
              const toAnthropicRequest = require("./outbound/anthropic").toAnthropicRequest;
              outboundRequestBody = JSON.stringify(
                toAnthropicRequest({ ...outboundRequest, stream: true }),
              );
            } else {
              outboundRequestBody = filterForLog(outboundRequest);
            }
          } catch {
            // 日志构建失败时 fallback 到基本格式
            outboundRequestBody = filterForLog(outboundRequest);
          }

          // 包装：先 yield first，再 yield 剩余；流结束后上报 stats
          const groupName = group.name;
          const chId = channel.id;
          const chName = channel.name;
          const inApiKeyId = request.apiKeyId;
          const modelName = item.modelName;

          async function* wrappedStream(): AsyncIterable<StreamEvent> {
            let usage: InternalResponse["usage"] = { inputTokens: 0, outputTokens: 0 };
            let contentText = "";
            const toolCalls = new Map<string, { id: string; name: string; inputJson: string }>();
            let thinkingText = "";
            let thinkingSignature = "";
            let stopReason = "";
            let responseModel = modelName;
            let ttftMs: number | null = null;
            let firstChunkSeen = false;

            function accumulate(evt: StreamEvent) {
              if (evt.type === "usage") usage = evt.usage;
              if (evt.type === "content_delta") {
                if (!firstChunkSeen) {
                  ttftMs = Date.now() - startTime;
                  firstChunkSeen = true;
                }
                if (evt.delta.type === "text") {
                  contentText += evt.delta.text;
                } else if (evt.delta.type === "tool_use") {
                  const { id, name, input_json_delta } = evt.delta;
                  if (!toolCalls.has(id)) toolCalls.set(id, { id, name, inputJson: "" });
                  toolCalls.get(id)!.inputJson += input_json_delta;
                } else if (evt.delta.type === "thinking") {
                  thinkingText += evt.delta.thinking || "";
                  thinkingSignature += evt.delta.signature || thinkingSignature;
                }
              }
              if (evt.type === "stop") {
                stopReason = evt.stopReason;
                responseModel = evt.model;
              }
            }

            try {
              if (!first.done) {
                accumulate(first.value);
                yield first.value;
              }
              while (true) {
                const next = await iterator.next();
                if (next.done) break;
                accumulate(next.value);
                yield next.value;
              }
              const logContent: import("./outbound/types").InternalContent[] = [];
              if (thinkingText || thinkingSignature) {
                logContent.push({
                  type: "thinking",
                  thinking: thinkingText,
                  signature: thinkingSignature,
                });
              }
              if (contentText) logContent.push({ type: "text", text: contentText });
              for (const tc of toolCalls.values()) {
                let input: unknown;
                try {
                  input = JSON.parse(tc.inputJson);
                } catch {
                  input = tc.inputJson;
                }
                logContent.push({ type: "tool_use", id: tc.id, name: tc.name, input });
              }
              if (logContent.length === 0) logContent.push({ type: "text", text: "" });
              const responseBody = JSON.stringify({
                content: logContent,
                usage,
                model: responseModel,
                stopReason,
              });
              statsCallback?.({
                groupName,
                channelId: chId,
                channelName: chName,
                modelName,
                apiKeyId: inApiKeyId,
                usage,
                durationMs: Date.now() - startTime,
                status: "success",
                requestBody: outboundRequestBody,
                rawRequestBody: request.rawBody,
                responseBody,
                ttftMs,
              });
            } catch (streamErr) {
              statsCallback?.({
                groupName,
                channelId: chId,
                channelName: chName,
                modelName,
                apiKeyId: inApiKeyId,
                usage: { inputTokens: 0, outputTokens: 0 },
                durationMs: Date.now() - startTime,
                status: "error",
                error: streamErr instanceof Error ? streamErr.message : String(streamErr),
                requestBody: outboundRequestBody,
                rawRequestBody: request.rawBody,
              });
              throw streamErr;
            }
          }

          return {
            stream: wrappedStream(),
            channelId: channel.id,
            channelName: channel.name,
            keyId: selectedKey.id,
            modelName: item.modelName,
            startTime,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          deps.circuitBreaker.recordFailure(item.channelId, selectedKey.id, item.modelName);
          if (is429(err)) {
            deps.keyPool.mark429(item.channelId, selectedKey.id);
          }

          // 构建实际发送的请求体用于日志记录
          const outboundRequest = { ...request, model: item.modelName };
          let outboundRequestBody: string;
          try {
            if (channel.type === "anthropic") {
              const toAnthropicRequest = require("./outbound/anthropic").toAnthropicRequest;
              outboundRequestBody = JSON.stringify(
                toAnthropicRequest({ ...outboundRequest, stream: true }),
              );
            } else {
              outboundRequestBody = filterForLog(outboundRequest);
            }
          } catch {
            // 日志构建失败时 fallback 到基本格式
            outboundRequestBody = filterForLog(outboundRequest);
          }

          statsCallback?.({
            groupName: group.name,
            channelId: channel.id,
            channelName: channel.name,
            modelName: item.modelName,
            apiKeyId: request.apiKeyId,
            usage: { inputTokens: 0, outputTokens: 0 },
            durationMs: Date.now() - startTime,
            status: "error",
            error: lastError.message,
            requestBody: outboundRequestBody,
            rawRequestBody: request.rawBody,
          });
        }
      }

      throw lastError ?? new Error(`all candidates exhausted for model: ${request.model}`);
    },

    onStats(callback) {
      statsCallback = callback;
    },
  };
}
