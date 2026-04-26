import type BetterSqlite3 from "better-sqlite3";
import type { RelayLog } from "@shared/types/gateway";
import { insertLogs } from "@/db/models/logDao";

const FLUSH_INTERVAL = 30_000;

export interface StatsCollector {
  record(data: Omit<RelayLog, "id" | "createdAt">): void;
  flush(): void;
  destroy(): void;
}

export function createStatsCollector(db: BetterSqlite3.Database): StatsCollector {
  let buffer: Omit<RelayLog, "id" | "createdAt">[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  function flush() {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    insertLogs(db, batch);
  }

  timer = setInterval(flush, FLUSH_INTERVAL);

  return {
    record(data) {
      buffer.push(data);
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
