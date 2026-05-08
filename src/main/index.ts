import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createMainWindow, setIsQuitting } from "./window";
import { Presenter } from "./presenter";
import { eventBus } from "./eventbus";
import { logger, paths } from "./utils";
import { TrayManager } from "./tray";
import { setupCliWrapper } from "./utils/cliWrapper";
import { userInfo } from "os";

if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "slime-dev"));
}

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

  const presenter = Presenter.getInstance();
  await presenter.init();
  await presenter.configPresenter.ensureDefaults();

  const mainWindow = createMainWindow();
  eventBus.setWindow(mainWindow);

  TrayManager.init(mainWindow);

  // Setup CLI wrapper for user terminal access
  const userName =
    ((await presenter.configPresenter.get("app.userProfile")) as any)?.name || userInfo().username;
  setupCliWrapper(userName).catch(() => {});

  logger.info("Slime ready");
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  // macOS: window close now hides to tray instead of closing
  // Non-macOS: quit when all windows closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createMainWindow();
    eventBus.setWindow(win);
  }
});

app.on("before-quit", () => {
  setIsQuitting(true);
});

app.on("will-quit", () => {
  TrayManager.destroy();
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});
