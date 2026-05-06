import { writeFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { app } from "electron";
import { execFileSync } from "child_process";
import { logger } from "./logger";

function findNode(): string {
  const candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    return execFileSync("/usr/bin/which", ["node"], { encoding: "utf-8" }).trim();
  } catch {
    return "node";
  }
}

export async function setupCliWrapper(userName: string): Promise<void> {
  try {
    const wrapperDir = join(homedir(), ".local", "bin");
    if (!existsSync(wrapperDir)) {
      mkdirSync(wrapperDir, { recursive: true });
    }

    const wrapperPath = join(wrapperDir, "slime-cli");
    const cliJsPath = app.isPackaged
      ? join(app.getAppPath(), "..", "resources", "slime-cli.js")
      : join(app.getAppPath(), "resources", "slime-cli.js");
    const userData = app.getPath("userData");

    const nodePath = findNode();
    const script =
      [
        "#!/bin/sh",
        `SLIME_ROLE=\${SLIME_ROLE:-user} \\`,
        `SLIME_USER_ID=\${SLIME_USER_ID:-${JSON.stringify(userName)}} \\`,
        `SLIME_DATA_DIR=\${SLIME_DATA_DIR:-${JSON.stringify(userData)}} \\`,
        `${JSON.stringify(nodePath)} ${JSON.stringify(cliJsPath)} "$@"`,
      ].join("\n") + "\n";

    writeFileSync(wrapperPath, script, "utf-8");
    chmodSync(wrapperPath, 0o755);
    logger.info("slime-cli wrapper created", { path: wrapperPath });
  } catch (err) {
    logger.warn("Failed to create slime-cli wrapper", { error: String(err) });
  }
}
