import { app } from "electron";
import { join } from "path";
import { appendFileSync, mkdirSync, existsSync } from "fs";

type LogLevel = "debug" | "info" | "warn" | "error";

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

class Logger {
  private logFile: string | null = null;

  private ensureLogFile(): string {
    if (!this.logFile) {
      const logDir = join(app.getPath("userData"), "logs");
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      const date = new Date().toISOString().split("T")[0];
      this.logFile = join(logDir, `slime-${date}.log`);
    }
    return this.logFile;
  }

  private log(level: LogLevel, message: string, meta?: object): void {
    const timestamp = new Date().toISOString();
    const entry = JSON.stringify({ timestamp, level, message, ...meta });

    if (!app.isPackaged) {
      console.log(`${COLORS[level]}[${level.toUpperCase()}]\x1b[0m ${message}`, meta || "");
    }

    try {
      appendFileSync(this.ensureLogFile(), entry + "\n");
    } catch {
      // 日志写入失败不应影响应用运行
    }
  }

  debug(message: string, meta?: object): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: object): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: object): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: object): void {
    this.log("error", message, meta);
  }
}

export const logger = new Logger();
