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
import { GatewayPresenter } from "./gatewayPresenter";
import { AgentConfigPresenter } from "./agentConfigPresenter";
import { AgentChatPresenter } from "./agentChat/agentChatPresenter";
import { AgentChatPresenterAdapter } from "./agentChatPresenterAdapter";
import { buildRollbackPrompt } from "./rollbackPrompt";
import type { EvolutionContext } from "@shared/types/evolution";
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
  gatewayPresenter: GatewayPresenter;
  agentConfigPresenter: AgentConfigPresenter;
  agentChatPresenter: AgentChatPresenterAdapter;

  evolutionPresenter: EvolutionPresenter;

  private toolPresenter: ToolPresenter;
  private agentChatEngine: AgentChatPresenter;
  private pendingRecovery: EvolutionContext | null = null;

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
    this.gatewayPresenter = new GatewayPresenter();
    this.agentConfigPresenter = new AgentConfigPresenter();
    this.agentChatEngine = new AgentChatPresenter(
      this.gatewayPresenter,
      this.toolPresenter,
      this.contentPresenter,
    );
    this.agentChatPresenter = new AgentChatPresenterAdapter(
      this.agentChatEngine,
      this.gatewayPresenter,
    );
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.evolutionPresenter,
      this.contentPresenter,
      this.gatewayPresenter,
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
    "gatewayPresenter",
    "agentConfigPresenter",
    "agentChatPresenter",
  ]);

  async init(): Promise<void> {
    this.pendingRecovery = await this.evolutionPresenter.restoreState();
    if (this.pendingRecovery) {
      logger.info("Pending evolution recovery", { stage: this.pendingRecovery.stage });
    }
    const port = (await this.configPresenter.get("gateway.port")) as number | null;
    await this.gatewayPresenter.init(port ?? undefined);
    this.agentConfigPresenter.init();
    logger.info("Presenter initialized");
  }

  getPendingRecovery(): EvolutionContext | null {
    return this.pendingRecovery;
  }

  clearPendingRecovery(): void {
    this.pendingRecovery = null;
  }

  resetAgent(): void {
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.evolutionPresenter,
      this.contentPresenter,
      this.gatewayPresenter,
    );
    logger.info("AgentPresenter reset");
  }

  async destroy(): Promise<void> {
    await this.gatewayPresenter.destroy();
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

// --- Recovery IPC handlers ---

ipcMain.handle("recovery:check", () => {
  const p = Presenter.getInstance();
  return p.getPendingRecovery();
});

ipcMain.handle("recovery:continue", async (_event, sessionId: string) => {
  const p = Presenter.getInstance();
  const recovery = p.getPendingRecovery();
  if (!recovery) return { success: false, error: "No pending recovery" };

  p.clearPendingRecovery();

  if (recovery.stage === "coding" || recovery.stage === "applying") {
    await p.agentPresenter.chat(
      sessionId,
      {
        text: "Evolution task interrupted by app restart. Check current code state and continue completing the evolution task.",
        files: [],
      },
      { hidden: true },
    );
  }
  return { success: true, stage: recovery.stage };
});

ipcMain.handle("recovery:abandon", async () => {
  const p = Presenter.getInstance();
  p.clearPendingRecovery();
  await p.evolutionPresenter.cancel();
  return { success: true };
});

// --- Package retry/skip IPC handlers ---

ipcMain.handle("evolution:retry-package", async () => {
  const p = Presenter.getInstance();
  await p.evolutionPresenter.retryPackage();
  return { success: true };
});

ipcMain.handle("evolution:skip-package", () => {
  const p = Presenter.getInstance();
  p.evolutionPresenter.skipPackage();
  return { success: true };
});
