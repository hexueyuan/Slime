import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function resolveConfigDir(): string {
  const explicitDataDir =
    process.env["SLIME_DATA_DIR"] ??
    process.env["SLIME_USER_DATA_DIR"] ??
    process.env["SLIME_E2E_USER_DATA"];

  if (explicitDataDir) {
    return join(explicitDataDir, ".slime-home");
  }

  return join(homedir(), ".slime");
}

function readConfPort(): number | null {
  const confFile = join(resolveConfigDir(), "slime.config.json");
  if (!existsSync(confFile)) return null;
  try {
    const obj = JSON.parse(readFileSync(confFile, "utf-8")) as Record<string, unknown>;
    const p = obj["task_server_port"];
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}

export function getBaseUrl(): string {
  const isDev = process.env["SLIME_DEV_MODE"] === "1";
  const fallbackPort = isDev ? 40002 : 40001;
  // SLIME_TASK_PORT 优先（exec 注入，兼容旧机制）
  const port = process.env["SLIME_TASK_PORT"] ?? String(readConfPort() ?? fallbackPort);
  return `http://127.0.0.1:${port}`;
}
