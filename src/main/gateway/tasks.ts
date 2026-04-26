import type BetterSqlite3 from "better-sqlite3";
import {
  aggregateToHourly,
  aggregateToDaily,
  deleteHourlyBefore,
  deleteDailyBefore,
} from "@/db/models/statsDao";
import { deleteLogsBefore } from "@/db/models/logDao";

const HOURLY_INTERVAL = 3_600_000;
const DAILY_INTERVAL = 86_400_000;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface ScheduledTasks {
  start(): void;
  stop(): void;
  runNow(): void;
}

export function createScheduledTasks(db: BetterSqlite3.Database): ScheduledTasks {
  let hourlyTimer: ReturnType<typeof setInterval> | undefined;
  let dailyTimer: ReturnType<typeof setInterval> | undefined;

  function runHourly() {
    const before = daysAgo(7);
    aggregateToHourly(db, before);
    deleteLogsBefore(db, before);
  }

  function runDaily() {
    const before30 = daysAgo(30);
    aggregateToDaily(db, before30);
    deleteHourlyBefore(db, before30);

    const before90 = daysAgo(90);
    deleteDailyBefore(db, before90);
  }

  return {
    start() {
      hourlyTimer = setInterval(runHourly, HOURLY_INTERVAL);
      dailyTimer = setInterval(runDaily, DAILY_INTERVAL);
    },
    stop() {
      if (hourlyTimer) {
        clearInterval(hourlyTimer);
        hourlyTimer = undefined;
      }
      if (dailyTimer) {
        clearInterval(dailyTimer);
        dailyTimer = undefined;
      }
    },
    runNow() {
      runHourly();
      runDaily();
    },
  };
}
