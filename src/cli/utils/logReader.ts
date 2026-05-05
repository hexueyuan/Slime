import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface ReadOptions {
  key?: string;
  tail?: number;
  head?: number;
}

export function getTodayLogPath(dataDir: string): string {
  const date = new Date().toISOString().split("T")[0];
  return join(dataDir, "logs", `slime-${date}.log`);
}

export function formatLogLine(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    const { timestamp, level, message, ...meta } = obj;
    const levelStr = `[${(level ?? "?").toUpperCase()}]`.padEnd(7);
    const metaStr = Object.keys(meta).length ? "  " + JSON.stringify(meta) : "";
    return `${levelStr} ${timestamp}  ${message}${metaStr}`;
  } catch {
    return raw;
  }
}

export function readLogs(dataDir: string, opts: ReadOptions): string[] {
  const logPath = getTodayLogPath(dataDir);
  if (!existsSync(logPath)) return [];

  const raw = readFileSync(logPath, "utf-8");
  let lines = raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map(formatLogLine);

  if (opts.key) {
    const lower = opts.key.toLowerCase();
    lines = lines.filter((l) => l.toLowerCase().includes(lower));
  }

  if (opts.tail !== undefined) {
    lines = lines.slice(-opts.tail);
  } else if (opts.head !== undefined) {
    lines = lines.slice(0, opts.head);
  }

  return lines;
}

export function clearLogs(dataDir: string): string {
  const logPath = getTodayLogPath(dataDir);
  if (!existsSync(logPath)) throw new Error("No logs found for today");
  writeFileSync(logPath, "");
  return logPath;
}
