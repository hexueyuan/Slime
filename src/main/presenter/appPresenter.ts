import { app } from "electron";
import { unlink } from "fs/promises";
import { join } from "path";
import { paths } from "@/utils";
import type { IAppPresenter } from "@shared/types/presenters";

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
}
