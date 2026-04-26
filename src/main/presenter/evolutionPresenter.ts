import type { IEvolutionPresenter } from "@shared/types/presenters";
import type {
  EvolutionStage,
  EvolutionStatus,
  EvolutionPlan,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
  EvolutionContext,
} from "@shared/types/evolution";
import type { GitPresenter } from "./gitPresenter";
import type { ConfigPresenter } from "./configPresenter";
import { EVOLUTION_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger, paths } from "@/utils";
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import { join } from "path";
import { app } from "electron";
import { execFile, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const CHANGELOG_FILE = "CHANGELOG.slime.md";

export class EvolutionPresenter implements IEvolutionPresenter {
  private stage: EvolutionStage = "idle";
  private description?: string;
  private plan?: EvolutionPlan;
  private startCommit?: string;
  private sessionId?: string;
  private _createdAt?: string;
  private pendingFinalize?: {
    tagName: string;
    summary: string;
    changedFiles: string[];
    semanticSummary: string;
  };
  rollbackInProgress = false;

  constructor(
    private git: GitPresenter,
    private config: ConfigPresenter,
  ) {}

  getStatus(): EvolutionStatus {
    return {
      stage: this.stage,
      description: this.description,
      plan: this.plan,
      startCommit: this.startCommit,
      sessionId: this.sessionId,
    };
  }

  async startEvolution(description: string, sessionId?: string): Promise<boolean> {
    if (this.stage !== "idle" || this.rollbackInProgress) return false;
    this.description = description;
    this.sessionId = sessionId;
    this.setStage("discuss");
    this.startCommit = await this.git.getCurrentCommit();
    return true;
  }

  submitPlan(plan: EvolutionPlan): boolean {
    if (this.stage !== "discuss") return false;
    this.plan = plan;
    this.setStage("coding");
    return true;
  }

  /**
   * Phase 1: mark evolution as applying. Actual changelog/commit deferred to
   * finalizeEvolution() so the agentic loop can finish any remaining work
   * (format, lint fix, etc.) and changedFiles is captured after git add -A.
   */
  async completeEvolution(
    summary: string,
    semanticSummary?: string,
  ): Promise<{ success: boolean; error?: string; tag?: string }> {
    if (this.stage !== "coding") return { success: false, error: "Not in coding stage" };
    this.setStage("applying");

    try {
      const tagName = await this.nextTagName();

      this.pendingFinalize = {
        tagName,
        summary,
        changedFiles: [], // populated in finalizeEvolution after git add
        semanticSummary: semanticSummary || "",
      };

      logger.info("Evolution prepared, awaiting finalize", { tag: tagName });
      return { success: true, tag: tagName };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Evolution prepare failed", { error });
      this.setStage("coding");
      return { success: false, error };
    }
  }

  /**
   * Phase 2: git add -A → detect changed files → write changelog → commit + tag + archive.
   * Called by agentPresenter AFTER the agentic loop exits, ensuring all file
   * changes (including post-complete format/lint fixes) are captured.
   */
  async finalizeEvolution(): Promise<boolean> {
    const pending = this.pendingFinalize;
    if (!pending) return false;
    this.pendingFinalize = undefined;

    try {
      // Stage all changes first
      const staged = await this.git.stageAll();
      if (!staged) throw new Error("git add failed");

      // Detect changed files from staged content (after git add -A, before commit)
      const changedFiles = this.startCommit
        ? await this.git.getChangedFiles(this.startCommit, undefined, { cached: true })
        : [];
      pending.changedFiles = changedFiles;

      // Write changelog with accurate file list
      await this.appendChangelog(pending.tagName, pending.summary, changedFiles);

      // Now commit (add -A again to include changelog)
      const committed = await this.git.addAndCommit(`evo: ${pending.summary}`);
      if (!committed) throw new Error("git commit failed");
      const tagged = await this.git.tag(pending.tagName, pending.summary);
      if (!tagged) throw new Error("git tag failed");

      const endCommit = await this.git.getCurrentCommit();
      const tags = await this.git.listTags("egg-*");
      const parentTag = tags.find((t) => t !== pending.tagName) || null;
      await this.writeArchive({
        version: 1,
        tag: pending.tagName,
        parentTag,
        request: this.description || "",
        summary: pending.summary,
        plan: this.plan || { scope: [], changes: [] },
        createdAt: new Date().toISOString(),
        startCommit: this.startCommit || "",
        endCommit,
        changedFiles: pending.changedFiles,
        semanticSummary: pending.semanticSummary,
        status: "active",
      });

      eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, pending.tagName, pending.summary);
      logger.info("Evolution finalized", { tag: pending.tagName });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Evolution finalize failed", { error });
      this.setStage("coding");
      return false;
    }
  }

  async cancel(): Promise<boolean> {
    if ((this.stage === "coding" || this.stage === "applying") && this.startCommit) {
      await this.git.rollbackToRef(this.startCommit);
    }
    if (this.stage !== "idle") {
      this.reset();
    }
    logger.info("Evolution cancelled");
    return true;
  }

  async getHistory(): Promise<EvolutionNode[]> {
    const tags = await this.git.listTags("egg-*");
    const changelog = await this.parseChangelog();
    const nodes: EvolutionNode[] = [];
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const entry = changelog.get(tag);
      const archive = await this.readArchive(tag);
      nodes.push({
        id: tag,
        tag,
        description: entry?.summary || tag,
        request: entry?.request || "",
        changes: entry?.changes || [],
        createdAt: entry?.date || "",
        gitRef: tag,
        parent: tags[i + 1],
        archived: archive?.status === "archived",
      });
    }
    return nodes;
  }

  restart(): void {
    logger.info("Restart requested");
    app.relaunch();
    app.quit();
  }

  async applyEvolution(): Promise<void> {
    if (this.stage !== "applying") return;

    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "committing",
      message: "正在提交变更...",
    });

    if (!app.isPackaged) {
      logger.info("Dev mode: skipping package + replace, resetting");
      this.reset();
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "committing",
        message: "开发模式：进化已完成，代码变更已提交",
      });
      return;
    }

    const packageResult = await this.runPackage();
    if (!packageResult.success) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "packaging",
        error: packageResult.error,
        message: "打包失败",
      });
      return;
    }

    const newApp = await this.findBuiltApp();
    if (!newApp) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "packaging",
        error: "未找到打包产物 (.app)",
        message: "打包产物缺失",
      });
      return;
    }

    const currentApp = this.resolveAppBundlePath();
    if (!currentApp) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "replacing",
        error: "无法定位当前应用路径",
        message: "替换失败",
      });
      return;
    }

    this.selfReplace(currentApp, newApp);
  }

  async retryPackage(): Promise<void> {
    if (this.stage !== "applying") return;
    await this.applyEvolution();
  }

  skipPackage(): void {
    if (this.stage !== "applying") return;
    logger.info("User skipped packaging, resetting");
    this.reset();
  }

  async runBuildVerification(): Promise<{ success: boolean; error?: string }> {
    const cwd = paths.effectiveProjectRoot;
    const MAX_OUTPUT = 2000;

    logger.info("Running build verification: typecheck");
    const tc = await this.execCommand("pnpm", ["run", "typecheck"], cwd);
    if (tc.exitCode !== 0) {
      const output = (tc.stderr || tc.stdout).slice(-MAX_OUTPUT);
      logger.warn("Build verification failed: typecheck", { exitCode: tc.exitCode });
      return { success: false, error: `typecheck failed:\n${output}` };
    }

    logger.info("Running build verification: build");
    const build = await this.execCommand("pnpm", ["run", "build"], cwd);
    if (build.exitCode !== 0) {
      const output = (build.stderr || build.stdout).slice(-MAX_OUTPUT);
      logger.warn("Build verification failed: build", { exitCode: build.exitCode });
      return { success: false, error: `build failed:\n${output}` };
    }

    logger.info("Build verification passed");
    return { success: true };
  }

  async restoreState(): Promise<EvolutionContext | null> {
    let context: EvolutionContext | null;
    try {
      context = await this.loadState();
    } catch {
      await this.clearState();
      return null;
    }
    if (!context) return null;

    try {
      if (!context.stage || context.stage === "idle") {
        await this.clearState();
        return null;
      }
      this.stage = context.stage;
      this.description = context.description;
      this.plan = context.plan;
      this.startCommit = context.startCommit;
      this.sessionId = context.sessionId;
      this._createdAt = context.createdAt;
      logger.info("Evolution state restored", { stage: context.stage });
      return context;
    } catch {
      await this.clearState();
      return null;
    }
  }

  private resolveAppBundlePath(): string | null {
    if (!app.isPackaged) return null;
    let current = app.getAppPath();
    while (current !== "/") {
      if (current.endsWith(".app")) return current;
      current = join(current, "..");
    }
    return null;
  }

  private async findBuiltApp(): Promise<string | null> {
    const distDir = join(paths.effectiveProjectRoot, "dist");
    const candidates = ["mac-arm64", "mac"];
    for (const sub of candidates) {
      const dir = join(distDir, sub);
      try {
        const entries = await readdir(dir);
        const appEntry = entries.find((e) => e.endsWith(".app"));
        if (appEntry) return join(dir, appEntry);
      } catch {
        // directory doesn't exist, try next
      }
    }
    return null;
  }

  private async runPackage(): Promise<{ success: boolean; error?: string }> {
    const cwd = paths.effectiveProjectRoot;
    const MAX_OUTPUT = 2000;

    logger.info("Running electron-builder package");
    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "packaging",
      message: "正在打包应用...",
    });

    const result = await this.execCommand("pnpm", ["run", "build:mac"], cwd, 600_000);
    if (result.exitCode !== 0) {
      const output = (result.stderr || result.stdout).slice(-MAX_OUTPUT);
      logger.warn("Package build failed", { exitCode: result.exitCode });
      return { success: false, error: `build:mac failed:\n${output}` };
    }

    logger.info("Package build completed");
    return { success: true };
  }

  private selfReplace(currentAppPath: string, newAppPath: string): void {
    const tempDir = join(app.getPath("temp"), `slime-update-${Date.now()}`);
    const scriptPath = join(tempDir, "swap-update.sh");
    const pid = process.pid;

    const script = [
      "#!/bin/bash",
      `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
      `rm -rf "${currentAppPath}"`,
      `cp -R "${newAppPath}" "${currentAppPath}"`,
      `open "${currentAppPath}"`,
    ].join("\n");

    mkdirSync(tempDir, { recursive: true });
    writeFileSync(scriptPath, script, { mode: 0o755 });

    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "replacing",
      message: "正在替换应用...",
    });

    const child = spawn("/bin/bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    app.exit(0);
  }

  private execCommand(
    cmd: string,
    args: string[],
    cwd: string,
    timeout = 300_000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      execFile(cmd, args, { cwd, timeout, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const e = err as any;
          resolve({
            stdout: (stdout as string) || e.stdout || "",
            stderr: (stderr as string) || e.stderr || "",
            exitCode: e.code ?? 1,
          });
        } else {
          resolve({ stdout: stdout as string, stderr: stderr as string, exitCode: 0 });
        }
      });
    });
  }

  // --- State persistence ---

  private async saveState(): Promise<void> {
    const context: EvolutionContext = {
      stage: this.stage,
      description: this.description || "",
      plan: this.plan,
      startCommit: this.startCommit || "",
      sessionId: this.sessionId || "",
      createdAt: this._createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._createdAt = context.createdAt;
    try {
      await writeFile(paths.contextFile, JSON.stringify(context, null, 2), "utf-8");
    } catch (err) {
      logger.error("Failed to save evolution state", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async loadState(): Promise<EvolutionContext | null> {
    let raw: string;
    try {
      raw = (await readFile(paths.contextFile, "utf-8")) as string;
    } catch {
      return null;
    }
    return JSON.parse(raw) as EvolutionContext;
  }

  private async clearState(): Promise<void> {
    try {
      await unlink(paths.contextFile);
    } catch {
      // file doesn't exist, that's fine
    }
  }

  // --- Archive CRUD ---

  private archiveDir(): string {
    return join(paths.effectiveProjectRoot, ".slime", "evolutions");
  }

  async writeArchive(archive: EvolutionArchive): Promise<void> {
    const dir = this.archiveDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${archive.tag}.json`), JSON.stringify(archive, null, 2), "utf-8");
  }

  async readArchive(tag: string): Promise<EvolutionArchive | null> {
    try {
      const content = await readFile(join(this.archiveDir(), `${tag}.json`), "utf-8");
      return JSON.parse(content) as EvolutionArchive;
    } catch {
      return null;
    }
  }

  async listArchives(): Promise<EvolutionArchive[]> {
    try {
      const files = await readdir(this.archiveDir());
      const archives: EvolutionArchive[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(this.archiveDir(), file), "utf-8");
          archives.push(JSON.parse(content) as EvolutionArchive);
        } catch {
          /* skip corrupt files */
        }
      }
      return archives;
    } catch {
      return [];
    }
  }

  async checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }> {
    const target = await this.readArchive(tag);
    if (!target) return { dependencies: [] };
    const all = await this.listArchives();
    const dependencies: EvolutionDependency[] = [];
    for (const a of all) {
      if (a.tag === tag || a.status !== "active") continue;
      if (a.createdAt <= target.createdAt) continue;
      const overlapping = a.changedFiles.filter((f) => target.changedFiles.includes(f));
      if (overlapping.length > 0) {
        dependencies.push({ tag: a.tag, summary: a.summary, overlappingFiles: overlapping });
      }
    }
    return { dependencies };
  }

  async archiveEvolution(tag: string, reason: string): Promise<void> {
    const archive = await this.readArchive(tag);
    if (!archive) return;
    archive.status = "archived";
    archive.archivedAt = new Date().toISOString();
    archive.archivedReason = reason;
    await this.writeArchive(archive);
  }

  private setStage(stage: EvolutionStage): void {
    this.stage = stage;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, stage);
    if (stage !== "idle") {
      this.saveState();
    }
  }

  private reset(): void {
    this.stage = "idle";
    this.description = undefined;
    this.plan = undefined;
    this.startCommit = undefined;
    this.sessionId = undefined;
    this.pendingFinalize = undefined;
    this._createdAt = undefined;
    this.clearState();
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle");
  }

  private async parseChangelog(): Promise<
    Map<string, { request: string; summary: string; date: string; changes: string[] }>
  > {
    const result = new Map<
      string,
      { request: string; summary: string; date: string; changes: string[] }
    >();
    let content: string;
    try {
      content = (await readFile(
        join(paths.effectiveProjectRoot, CHANGELOG_FILE),
        "utf-8",
      )) as string;
    } catch {
      return result;
    }

    const sections = content.split("## [");
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const headerMatch = section.match(/^(.+?)\]\s*-\s*(\S+)/);
      if (!headerMatch) continue;
      const tag = headerMatch[1];
      const date = headerMatch[2];

      const requestMatch = section.match(/- Request:\s*"(.*)"/);
      const summaryMatch = section.match(/- Summary:\s*(.*)/);

      const request = requestMatch ? requestMatch[1] : "";
      const summary = summaryMatch ? summaryMatch[1].trim() : "";

      const changes: string[] = [];
      const changesIdx = section.indexOf("### Changes");
      if (changesIdx !== -1) {
        const changesBlock = section.slice(changesIdx);
        const lines = changesBlock.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("- ") && !trimmed.includes("(no file changes recorded)")) {
            changes.push(trimmed.slice(2));
          }
        }
      }

      result.set(tag, { request, summary, date, changes });
    }
    return result;
  }

  private async nextTagName(): Promise<string> {
    const user = ((await this.config.get("evolution.user")) as string) || "dev";
    const tags = await this.git.listTags("egg-v0.1-*");
    const maxSeq = tags.reduce((max, t) => {
      const m = t.match(/\.(\d+)$/);
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    return `egg-v0.1-${user}.${maxSeq + 1}`;
  }

  private async appendChangelog(
    tag: string,
    summary: string,
    changedFiles: string[],
  ): Promise<void> {
    const filePath = join(paths.effectiveProjectRoot, CHANGELOG_FILE);
    let existing: string;
    try {
      const content = await readFile(filePath, "utf-8");
      existing = typeof content === "string" ? content : "# Slime Evolution Changelog\n\n";
    } catch {
      existing = "# Slime Evolution Changelog\n\n";
    }

    const date = new Date().toISOString().split("T")[0];
    const changesSection =
      changedFiles.length > 0
        ? changedFiles.map((f) => `- ${f}`).join("\n")
        : "- (no file changes recorded)";

    const entry =
      `## [${tag}] - ${date}\n\n` +
      `### Evolution\n\n` +
      `- Request: "${this.description || ""}"\n` +
      `- Summary: ${summary}\n` +
      `- Status: Success\n\n` +
      `### Changes\n\n` +
      `${changesSection}\n\n---\n\n`;

    const headerEnd = existing.indexOf("\n\n");
    if (headerEnd > -1) {
      const header = existing.slice(0, headerEnd + 2);
      const rest = existing.slice(headerEnd + 2);
      await writeFile(filePath, header + entry + rest, "utf-8");
    } else {
      await writeFile(filePath, existing + "\n" + entry, "utf-8");
    }
  }
}
