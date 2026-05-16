import type BetterSqlite3 from "better-sqlite3";
import type { RelayLog } from "@shared/types/gateway";
import { insertLogs } from "@/db/models/logDao";

const DEFAULT_FLUSH_INTERVAL = 2_000;
const DEFAULT_BATCH_SIZE = 50;

export interface StatsFlushInfo {
  count: number;
}

export interface StatsCollectorOptions {
  flushIntervalMs?: number;
  batchSize?: number;
  onFlush?: (info: StatsFlushInfo) => void;
}

export interface StatsCollector {
  record(data: Omit<RelayLog, "id" | "createdAt">): void;
  flush(): void;
  destroy(): void;
}

export function createStatsCollector(
  db: BetterSqlite3.Database,
  options: StatsCollectorOptions = {},
): StatsCollector {
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  let buffer: Omit<RelayLog, "id" | "createdAt">[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  function flush() {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    insertLogs(db, batch);
    options.onFlush?.({ count: batch.length });
  }

  timer = setInterval(flush, flushIntervalMs);

  return {
    record(data) {
      buffer.push(data);
      if (buffer.length >= batchSize) flush();
    },
    flush,
    destroy() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      flush();
    },
  };
}
