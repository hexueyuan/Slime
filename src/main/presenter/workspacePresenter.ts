import { existsSync, mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { app } from "electron";
import type { IWorkspacePresenter, WorkspaceStatus, InitProgress } from "@shared/types/presenters";
import { WORKSPACE_EVENTS } from "@shared/events";
import { logger, paths } from "@/utils";
import { eventBus } from "@/eventbus";

const DEFAULT_REMOTE = "https://github.com/hexueyuan/Slime.git";

export class WorkspacePresenter implements IWorkspacePresenter {
  private lastError?: string;

  async needsInit(): Promise<boolean> {
    if (!app.isPackaged) return false;
    return !(await this.isReady());
  }

  async isReady(): Promise<boolean> {
    return existsSync(paths.workspaceReadyFile);
  }

  getProjectRoot(): string {
    return paths.effectiveProjectRoot;
  }

  async initialize(remote: string = DEFAULT_REMOTE): Promise<boolean> {
    if (!app.isPackaged) {
      logger.info("workspace: dev mode, skip init");
      return true;
    }

    if (await this.isReady()) {
      logger.info("workspace: already initialized");
      return true;
    }

    try {
      logger.info("workspace: initializing...", { remote });
      mkdirSync(paths.workspaceDir, { recursive: true });

      // Clone
      this.sendProgress({ stage: "clone", message: "正在克隆源码仓库...", percent: 0 });
      await this.runCommand("git", ["clone", "--depth", "1", "--progress", remote, "slime-src"], {
        cwd: paths.workspaceDir,
        onProgress: (msg) => {
          this.sendProgress({ stage: "clone", message: msg, percent: 30 });
        },
      });

      // Install
      this.sendProgress({ stage: "install", message: "正在安装依赖...", percent: 50 });
      await this.runCommand("pnpm", ["install"], {
        cwd: paths.sourceDir,
        onProgress: (msg) => {
          this.sendProgress({ stage: "install", message: msg, percent: 70 });
        },
      });

      // Done
      writeFileSync(paths.workspaceReadyFile, new Date().toISOString());
      this.sendProgress({ stage: "done", message: "初始化完成", percent: 100 });
      logger.info("workspace: initialized successfully");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.sendProgress({ stage: "error", message: msg });
      logger.error("workspace: init failed", { error: msg });
      return false;
    }
  }

  async getStatus(): Promise<WorkspaceStatus> {
    const ready = await this.isReady();
    let currentBranch: string | undefined;

    if (ready && existsSync(paths.sourceDir)) {
      try {
        currentBranch = await this.runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: paths.sourceDir,
          capture: true,
        });
        currentBranch = currentBranch.trim();
      } catch {
        // ignore
      }
    }

    return {
      ready,
      sourceDir: paths.sourceDir,
      gitRemote: DEFAULT_REMOTE,
      currentBranch,
      lastError: this.lastError,
    };
  }

  private sendProgress(progress: InitProgress): void {
    eventBus.sendToRenderer(WORKSPACE_EVENTS.INIT_PROGRESS, progress);
  }

  private runCommand(
    cmd: string,
    args: string[],
    opts: { cwd: string; onProgress?: (msg: string) => void; capture?: boolean },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd: opts.cwd });
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const str = data.toString();
        stdout += str;
        opts.onProgress?.(str.trim());
      });

      proc.stderr?.on("data", (data) => {
        const str = data.toString();
        stderr += str;
        opts.onProgress?.(str.trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(opts.capture ? stdout : "");
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }
}
