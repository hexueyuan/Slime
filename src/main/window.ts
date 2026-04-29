import { app, BrowserWindow, shell, nativeImage } from "electron";
import { join } from "path";
import { logger } from "@/utils";
import { paths } from "@/utils/paths";

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
