import { app, Tray, Menu, nativeImage, BrowserWindow } from "electron";
import { join } from "path";
import { paths } from "@/utils/paths";

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

export const TrayManager = {
  init(window: BrowserWindow): void {
    if (process.platform !== "darwin") return;

    win = window;
    const iconPath = join(paths.projectRoot, "build", "icon.png");
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip("Slime");

    tray.on("click", () => {
      if (win?.isVisible()) {
        win.hide();
      } else {
        win?.show();
        win?.focus();
      }
    });

    tray.on("right-click", () => {
      const menu = Menu.buildFromTemplate([
        {
          label: win?.isVisible() ? "隐藏窗口" : "显示窗口",
          click: () => {
            if (win?.isVisible()) {
              win.hide();
            } else {
              win?.show();
              win?.focus();
            }
          },
        },
        { type: "separator" },
        {
          label: "退出 Slime",
          click: () => {
            app.quit();
          },
        },
      ]);
      tray!.setContextMenu(menu);
    });
  },

  destroy(): void {
    tray?.destroy();
    tray = null;
    win = null;
  },
};
