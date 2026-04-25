import { ipcMain } from "electron";
import type { IPresenter } from "@shared/types/presenters";
import { AppPresenter } from "./appPresenter";
import { ConfigPresenter } from "./configPresenter";
import { AgentPresenter } from "./agentPresenter";
import { SessionPresenter } from "./sessionPresenter";
import { FilePresenter } from "./filePresenter";
import { GitPresenter } from "./gitPresenter";
import { ToolPresenter } from "./toolPresenter";
import { EvolutionPresenter } from "./evolutionPresenter";
import { WorkspacePresenter } from "./workspacePresenter";
import { ContentPresenter } from "./contentPresenter";
import { buildRollbackPrompt } from "./rollbackPrompt";
import { EVOLUTION_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger, paths } from "@/utils";

type DispatchableKey = Exclude<keyof IPresenter, "init" | "destroy">;

export class Presenter implements IPresenter {
  appPresenter: AppPresenter;
  configPresenter: ConfigPresenter;
  agentPresenter: AgentPresenter;
  sessionPresenter: SessionPresenter;
  filePresenter: FilePresenter;
  gitPresenter: GitPresenter;
  contentPresenter: ContentPresenter;
  workspacePresenter: WorkspacePresenter;

  evolutionPresenter: EvolutionPresenter;

  private toolPresenter: ToolPresenter;

  private static instance: Presenter | null = null;

  private constructor() {
    this.workspacePresenter = new WorkspacePresenter();
    this.appPresenter = new AppPresenter();
    this.configPresenter = new ConfigPresenter();
    this.sessionPresenter = new SessionPresenter();
    this.filePresenter = new FilePresenter(paths.effectiveProjectRoot);
    this.contentPresenter = new ContentPresenter();
    this.gitPresenter = new GitPresenter(paths.effectiveProjectRoot);
    this.evolutionPresenter = new EvolutionPresenter(this.gitPresenter, this.configPresenter);
    this.toolPresenter = new ToolPresenter(
      this.filePresenter,
      this.contentPresenter,
      this.evolutionPresenter,
    );
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.evolutionPresenter,
      this.contentPresenter,
    );
  }

  static getInstance(): Presenter {
    if (!Presenter.instance) {
      Presenter.instance = new Presenter();
    }
    return Presenter.instance;
  }

  /** Test only: reset singleton */
  static _resetForTest(): void {
    Presenter.instance = null;
  }

  static readonly DISPATCHABLE = new Set<DispatchableKey>([
    "appPresenter",
    "configPresenter",
    "agentPresenter",
    "sessionPresenter",
    "filePresenter",
    "gitPresenter",
    "contentPresenter",
    "workspacePresenter",
    "evolutionPresenter",
  ]);

  init(): void {
    logger.info("Presenter initialized");
  }

  resetAgent(): void {
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.evolutionPresenter,
      this.contentPresenter,
    );
    logger.info("AgentPresenter reset");
  }

  async destroy(): Promise<void> {
    logger.info("Presenter destroyed");
  }
}

ipcMain.handle("agent:reset", () => {
  Presenter.getInstance().resetAgent();
});

ipcMain.handle(
  "presenter:call",
  async (_event, name: string, method: string, ...args: unknown[]) => {
    if (!Presenter.DISPATCHABLE.has(name as DispatchableKey)) {
      throw new Error(`Presenter '${name}' is not dispatchable`);
    }
    const presenter = Presenter.getInstance();
    const target = presenter[name as DispatchableKey] as unknown as Record<string, unknown>;
    if (typeof target[method] !== "function") {
      throw new Error(`Method '${method}' not found on '${name}'`);
    }
    return (target[method] as Function)(...args);
  },
);

// --- Rollback IPC handlers ---

let rollbackSavedCommit: string | null = null;

ipcMain.handle("rollback:check-deps", async (_event, tag: string) => {
  const p = Presenter.getInstance();
  const { dependencies } = await p.evolutionPresenter.checkDependencies(tag);
  // List all active versions after target
  const archive = await p.evolutionPresenter.readArchive(tag);
  const all = await p.evolutionPresenter.listArchives();
  const affected = archive
    ? all
        .filter((a) => a.status === "active" && a.tag !== tag && a.createdAt > archive.createdAt)
        .map((a) => ({ tag: a.tag, summary: a.summary }))
    : [];
  return { dependencies, affected, hasArchive: !!archive };
});

ipcMain.handle("rollback:start", async (_event, tag: string) => {
  const p = Presenter.getInstance();
  const evo = p.evolutionPresenter;

  if (evo.rollbackInProgress) {
    return { success: false, error: "Rollback already in progress" };
  }

  const archive = await evo.readArchive(tag);
  if (!archive) {
    return { success: false, error: "No archive found for this version" };
  }

  try {
    evo.rollbackInProgress = true;
    rollbackSavedCommit = await p.gitPresenter.getCurrentCommit();
    eventBus.sendToRenderer(EVOLUTION_EVENTS.ROLLBACK_STARTED, tag);

    // Create rollback session
    const session = await p.sessionPresenter.createSession(`rollback: ${tag}`);

    // Build prompt
    const { dependencies } = await evo.checkDependencies(tag);
    const prompt = buildRollbackPrompt(archive, dependencies);

    // Run AI agent (hidden: true prevents prompt from showing in chat UI)
    await p.agentPresenter.chat(session.id, { text: prompt, files: [] }, { hidden: true });

    // Verify with typecheck
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    try {
      await execAsync("pnpm run typecheck", {
        cwd: paths.effectiveProjectRoot,
        timeout: 120000,
      });
    } catch {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.ROLLBACK_FAILED, tag, "typecheck failed");
      return { success: false, error: "typecheck failed" };
    }

    // Commit + archive
    const committed = await p.gitPresenter.addAndCommit(`rollback: revert ${tag}`);
    if (!committed) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.ROLLBACK_FAILED, tag, "commit failed");
      return { success: false, error: "commit failed" };
    }

    await evo.archiveEvolution(tag, `Rolled back via AI semantic rollback`);
    evo.rollbackInProgress = false;
    rollbackSavedCommit = null;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.ROLLBACK_COMPLETED, tag);
    logger.info("Rollback completed", { tag });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    eventBus.sendToRenderer(EVOLUTION_EVENTS.ROLLBACK_FAILED, tag, error);
    logger.error("Rollback failed", { tag, error });
    return { success: false, error };
  }
});

ipcMain.handle("rollback:abort", async () => {
  const p = Presenter.getInstance();
  if (rollbackSavedCommit) {
    await p.gitPresenter.rollbackToRef(rollbackSavedCommit);
    rollbackSavedCommit = null;
  }
  p.evolutionPresenter.rollbackInProgress = false;
  logger.info("Rollback aborted, restored to saved commit");
  return { success: true };
});
