import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { existsSync, mkdirSync } from "fs";
import { createMainWindow } from "./window";
import { registerAllHandlers } from "./ipc";
import { logger, paths } from "./utils";

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function ensureDirectories(): void {
  const dirs = [paths.slimeDir, paths.stateDir, paths.configDir];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

async function bootstrap(): Promise<void> {
  logger.info("Slime starting...", { version: app.getVersion() });

  electronApp.setAppUserModelId("com.slime.app");

  ensureDirectories();
  registerAllHandlers();
  createMainWindow();

  logger.info("Slime ready");
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});
