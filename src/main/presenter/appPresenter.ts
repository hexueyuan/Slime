import { app, dialog } from "electron";
import { mkdirSync, readdirSync, writeFileSync } from "fs";
import { unlink } from "fs/promises";
import { join, dirname } from "path";
import { execSync, spawn } from "child_process";
import { paths } from "@/utils";
import type { IAppPresenter } from "@shared/types/presenters";

function resolveAppBundlePath(): string | null {
  let current = app.getAppPath();
  for (let i = 0; i < 10; i++) {
    if (current.endsWith(".app")) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export class AppPresenter implements IAppPresenter {
  getVersion(): string {
    return app.getVersion();
  }

  async resetAllData(): Promise<{ success: boolean; error?: string }> {
    const targets = [join(paths.slimeDir, "gateway.db"), paths.configFile];
    try {
      for (const p of targets) {
        await unlink(p).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async selectLocalZip(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "选择 Slime 安装包",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  async applyLocalZip(zipPath: string): Promise<{ success: boolean; error?: string }> {
    if (!app.isPackaged) {
      return { success: false, error: "仅 packaged 模式支持本地更新" };
    }
    try {
      const currentAppPath = resolveAppBundlePath();
      if (!currentAppPath) {
        return { success: false, error: "无法找到当前 .app 路径" };
      }
      const tempDir = join(app.getPath("temp"), `slime-local-update-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      execSync(`ditto -xk "${zipPath}" "${tempDir}"`, { timeout: 120000 });
      const entries = readdirSync(tempDir) as string[];
      const appEntry = entries.find((e) => e.endsWith(".app"));
      if (!appEntry) {
        return { success: false, error: "安装包内未找到 .app 文件" };
      }
      const extractedAppPath = join(tempDir, appEntry);
      const pid = process.pid;
      const scriptPath = join(tempDir, "swap.sh");
      const script = [
        "#!/bin/bash",
        `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
        `rm -rf "${currentAppPath}"`,
        `mv "${extractedAppPath}" "${currentAppPath}"`,
        `open "${currentAppPath}"`,
        `rm -rf "${tempDir}"`,
      ].join("\n");
      writeFileSync(scriptPath, script, { mode: 0o755 });
      const child = spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" });
      child.unref();
      app.exit(0);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
