import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { existsSync, mkdirSync } from "fs";
import { createMainWindow, setIsQuitting, registerWindowIpc } from "./window";
import { Presenter } from "./presenter";
import { eventBus } from "./eventbus";
import { logger, paths } from "./utils";
import { TrayManager } from "./tray";
import { setupCliWrapper } from "./utils/cliWrapper";
import { userInfo } from "os";
import { resolveRuntimeProfile } from "./utils/runtimeProfile";
import { acquireRuntimeLock, RuntimeLockError, type RuntimeLock } from "./utils/runtimeLock";

const runtimeProfile = resolveRuntimeProfile();
let runtimeLock: RuntimeLock | null = null;

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
  logger.info("Slime starting...", {
    version: app.getVersion(),
    profile: runtimeProfile.name,
    userData: runtimeProfile.userData,
  });

  electronApp.setAppUserModelId("com.slime.app");

  ensureDirectories();
  try {
    runtimeLock = acquireRuntimeLock(runtimeProfile);
  } catch (error) {
    if (error instanceof RuntimeLockError) {
      logger.error(error.message, { lockFile: error.lockFile, userData: runtimeProfile.userData });
      app.quit();
      return;
    }
    throw error;
  }

  const presenter = Presenter.getInstance();
  await presenter.init();
  await presenter.configPresenter.ensureDefaults();

  const mainWindow = createMainWindow();
  registerWindowIpc();
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
  runtimeLock?.release();
  runtimeLock = null;
  TrayManager.destroy();
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});
