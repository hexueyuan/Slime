import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  readLogs,
  clearLogs,
  getTodayLogPath,
  formatLogLine,
} from "../../../src/cli/utils/logReader";

const testDir = join(tmpdir(), `slime-logreader-test-${Date.now()}`);

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

beforeEach(() => {
  mkdirSync(join(testDir, "logs"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("getTodayLogPath", () => {
  it("returns correct path for today", () => {
    const p = getTodayLogPath(testDir);
    expect(p).toBe(join(testDir, "logs", `slime-${todayStr()}.log`));
  });
});

describe("formatLogLine", () => {
  it("formats valid JSON log line", () => {
    const line = JSON.stringify({
      timestamp: "2026-05-05T10:00:00.000Z",
      level: "info",
      message: "started",
      port: 3000,
    });
    const formatted = formatLogLine(line);
    expect(formatted).toBe('[INFO]  2026-05-05T10:00:00.000Z  started  {"port":3000}');
  });

  it("returns original line when JSON parse fails", () => {
    const line = "not valid json";
    expect(formatLogLine(line)).toBe("not valid json");
  });

  it("pads level to 5 chars", () => {
    const line = JSON.stringify({
      timestamp: "2026-05-05T10:00:00.000Z",
      level: "warn",
      message: "msg",
    });
    const formatted = formatLogLine(line);
    expect(formatted).toContain("[WARN] ");
  });
});

describe("readLogs", () => {
  it("throws when logs directory does not exist", () => {
    expect(() => readLogs("/nonexistent/path", {})).toThrow("data directory not found");
  });

  it("returns empty array when log file does not exist", () => {
    const lines = readLogs(testDir, {});
    expect(lines).toEqual([]);
  });

  it("reads all lines from log file", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    writeFileSync(
      logPath,
      [
        JSON.stringify({ timestamp: "t1", level: "info", message: "line1" }),
        JSON.stringify({ timestamp: "t2", level: "error", message: "line2" }),
      ].join("\n") + "\n",
    );
    const lines = readLogs(testDir, {});
    expect(lines).toHaveLength(2);
  });
  it("applies --tail n", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    const entries = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({ timestamp: `t${i}`, level: "info", message: `line${i}` }),
    );
    writeFileSync(logPath, entries.join("\n") + "\n");
    const lines = readLogs(testDir, { tail: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("line4");
  });

  it("applies --head n", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    const entries = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({ timestamp: `t${i}`, level: "info", message: `line${i}` }),
    );
    writeFileSync(logPath, entries.join("\n") + "\n");
    const lines = readLogs(testDir, { head: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("line0");
  });

  it("applies key filter before tail", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    const entries = [
      JSON.stringify({ timestamp: "t0", level: "info", message: "error one" }),
      JSON.stringify({ timestamp: "t1", level: "info", message: "ok" }),
      JSON.stringify({ timestamp: "t2", level: "info", message: "error two" }),
    ];
    writeFileSync(logPath, entries.join("\n") + "\n");
    const lines = readLogs(testDir, { key: "error", tail: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("error two");
  });
});

describe("clearLogs", () => {
  it("truncates log file to empty", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    writeFileSync(logPath, "some content\n");
    clearLogs(testDir);
    const { statSync } = require("fs");
    expect(statSync(logPath).size).toBe(0);
  });

  it("returns log path", () => {
    const logPath = join(testDir, "logs", `slime-${todayStr()}.log`);
    writeFileSync(logPath, "content\n");
    const result = clearLogs(testDir);
    expect(result).toBe(logPath);
  });

  it("throws when log file does not exist", () => {
    expect(() => clearLogs(testDir)).toThrow("No logs found for today");
  });
});
