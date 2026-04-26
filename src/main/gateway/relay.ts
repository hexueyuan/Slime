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
}) => void;

export interface Relay {
  relay(request: InternalRequest): Promise<RelayResult>;
  relayStream(request: InternalRequest): Promise<RelayStreamResult>;
  onStats(callback: StatsCallback): void;
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
            apiKeyId: selectedKey.id,
            usage: response.usage,
            durationMs,
            status: "success",
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
            apiKeyId: selectedKey.id,
            usage: { inputTokens: 0, outputTokens: 0 },
            durationMs,
            status: "error",
            error: lastError.message,
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

          // 包装：先 yield first，再 yield 剩余
          async function* wrappedStream(): AsyncIterable<StreamEvent> {
            if (!first.done) yield first.value;
            while (true) {
              const next = await iterator.next();
              if (next.done) break;
              yield next.value;
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
            apiKeyId: selectedKey.id,
            usage: { inputTokens: 0, outputTokens: 0 },
            durationMs: Date.now() - startTime,
            status: "error",
            error: lastError.message,
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
