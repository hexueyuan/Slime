import { app, BrowserWindow, shell, nativeImage, ipcMain } from "electron";
import { join } from "path";
import { logger } from "@/utils";
import { paths } from "@/utils/paths";
import { GROUP_CHAT_EVENTS } from "@shared/events";

let mainWindow: BrowserWindow | null = null;

export let isQuitting = false;
export function setIsQuitting(v: boolean): void {
  isQuitting = v;
}

const iconPath = !app.isPackaged ? join(paths.projectRoot, "build", "icon.png") : undefined;

export function createMainWindow(): BrowserWindow {
  if (!app.isPackaged && process.platform === "darwin" && iconPath) {
    const img = nativeImage.createFromPath(iconPath);
    app.dock?.setIcon(img);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    icon: iconPath,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    title: "Slime v0.1 (egg)",
  });

  mainWindow.on("close", (e) => {
    if (process.platform === "darwin" && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    logger.info("Main window ready");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Map: sessionId -> BrowserWindow（独立窗口）
const detachedWindows = new Map<string, BrowserWindow>();

export function createDetachedWindow(sessionId: string): BrowserWindow {
  // 如果已存在，focus 它
  const existing = detachedWindows.get(sessionId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    title: "群聊",
  });

  const query = `detached=1&sessionId=${encodeURIComponent(sessionId)}`;
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query}`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { detached: "1", sessionId },
    });
  }

  detachedWindows.set(sessionId, win);

  win.on("closed", () => {
    detachedWindows.delete(sessionId);
    // Notify main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(GROUP_CHAT_EVENTS.DETACHED_CLOSED, { sessionId });
    }
  });

  return win;
}

export function isSessionDetached(sessionId: string): boolean {
  const win = detachedWindows.get(sessionId);
  return !!win && !win.isDestroyed();
}

export function registerWindowIpc(): void {
  ipcMain.handle("group_chat:open_detached", (_event, sessionId: string) => {
    createDetachedWindow(sessionId);
  });

  ipcMain.handle("group_chat:focus_detached", (_event, sessionId: string) => {
    const win = detachedWindows.get(sessionId);
    if (win && !win.isDestroyed()) win.focus();
  });
}
