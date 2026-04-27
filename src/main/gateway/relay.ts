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
  responseBody?: string;
  ttftMs?: number | null;
}) => void;

export interface Relay {
  relay(request: InternalRequest): Promise<RelayResult>;
  relayStream(request: InternalRequest): Promise<RelayStreamResult>;
  onStats(callback: StatsCallback): void;
}

function filterForLog(request: InternalRequest): string {
  const filtered = {
    ...request,
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
          baseUrl: channel.baseUrls[0],
          apiKey: selectedKey.key,
          proxy: channel.proxy,
          timeout: channel.timeout,
        };

        const start = Date.now();
        try {
          const response = await adapter.send({ ...request, model: item.modelName }, config);
          const durationMs = Date.now() - start;
          deps.circuitBreaker.recordSuccess(item.channelId, selectedKey.id, item.modelName);
          statsCallback?.({
            groupName: group.name,
            channelId: channel.id,
            channelName: channel.name,
            modelName: item.modelName,
            apiKeyId: request.apiKeyId,
            usage: response.usage,
            durationMs,
            status: "success",
            requestBody: filterForLog(request),
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
            requestBody: filterForLog(request),
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
          baseUrl: channel.baseUrls[0],
          apiKey: selectedKey.key,
          proxy: channel.proxy,
          timeout: channel.timeout,
        };

        const startTime = Date.now();
        try {
          const stream = adapter.sendStream({ ...request, model: item.modelName }, config);
          // 尝试拉取第一个 chunk 确认连接成功
          const iterator = stream[Symbol.asyncIterator]();
          const first = await iterator.next();

          deps.circuitBreaker.recordSuccess(item.channelId, selectedKey.id, item.modelName);

          // 包装：先 yield first，再 yield 剩余；流结束后上报 stats
          const groupName = group.name;
          const chId = channel.id;
          const chName = channel.name;
          const inApiKeyId = request.apiKeyId;
          const modelName = item.modelName;

          async function* wrappedStream(): AsyncIterable<StreamEvent> {
            let usage: InternalResponse["usage"] = { inputTokens: 0, outputTokens: 0 };
            let contentText = "";
            let stopReason = "";
            let responseModel = modelName;
            let ttftMs: number | null = null;
            let firstChunkSeen = false;

            function accumulate(evt: StreamEvent) {
              if (evt.type === "usage") usage = evt.usage;
              if (evt.type === "content_delta" && evt.delta.type === "text") {
                if (!firstChunkSeen) {
                  ttftMs = Date.now() - startTime;
                  firstChunkSeen = true;
                }
                contentText += evt.delta.text;
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
              const responseBody = JSON.stringify({
                content: [{ type: "text", text: contentText }],
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
                requestBody: filterForLog(request),
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
                requestBody: filterForLog(request),
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
            requestBody: filterForLog(request),
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
