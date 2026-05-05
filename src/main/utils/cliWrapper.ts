import { writeFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { app } from "electron";
import { logger } from "./logger";

export async function setupCliWrapper(userName: string): Promise<void> {
  try {
    const wrapperDir = join(homedir(), ".local", "bin");
    if (!existsSync(wrapperDir)) {
      mkdirSync(wrapperDir, { recursive: true });
    }

    const wrapperPath = join(wrapperDir, "slime-cli");
    const cliJsPath = app.isPackaged
      ? join(app.getAppPath(), "..", "slime-cli.js")
      : join(app.getAppPath(), "resources", "slime-cli.js");
    const userData = app.getPath("userData");

    const script =
      [
        "#!/bin/sh",
        `SLIME_ROLE=user \\`,
        `SLIME_USER_ID=${JSON.stringify(userName)} \\`,
        `SLIME_DATA_DIR=${JSON.stringify(userData)} \\`,
        `node ${JSON.stringify(cliJsPath)} "$@"`,
      ].join("\n") + "\n";

    writeFileSync(wrapperPath, script, "utf-8");
    chmodSync(wrapperPath, 0o755);
    logger.info("slime-cli wrapper created", { path: wrapperPath });
  } catch (err) {
    logger.warn("Failed to create slime-cli wrapper", { error: String(err) });
  }
}
