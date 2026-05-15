import { ipcMain, dialog, shell } from "electron";
import type { IPresenter } from "@shared/types/presenters";
import { AppPresenter } from "./appPresenter";
import { ConfigPresenter } from "./configPresenter";
import { AgentPresenter } from "./agentPresenter";
import { SessionPresenter } from "./sessionPresenter";
import { FilePresenter } from "./filePresenter";
import { GitPresenter } from "./gitPresenter";
import { ToolPresenter } from "./toolPresenter";
import { WorkspacePresenter } from "./workspacePresenter";
import { ContentPresenter } from "./contentPresenter";
import { GatewayPresenter } from "./gatewayPresenter";
import { AgentConfigPresenter } from "./agentConfigPresenter";
import { AgentChatPresenter } from "./agentChat/agentChatPresenter";
import { AgentChatPresenterAdapter } from "./agentChatPresenterAdapter";
import { eventBus } from "@/eventbus";
import { logger, paths } from "@/utils";
import { browserSession } from "@/browser/browserSession";
import { MCPServerPresenter } from "./mcpServerPresenter";
import { MCPToolBridge } from "./mcpToolBridge";
import { DevPresenter } from "./devPresenter";
import { SkillPresenter } from "./skillPresenter";
import { taskPresenter } from "./taskPresenter";
import { GroupChatPresenter } from "./groupChatPresenter";
import { agentInvokerRegistry } from "./agentChat/agentInvokerRegistry";

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
  mcpServerPresenter: MCPServerPresenter;
  devPresenter: DevPresenter;
  groupChatPresenter: GroupChatPresenter;

  private toolPresenter: ToolPresenter;
  private agentChatEngine: AgentChatPresenter;

  private static instance: Presenter | null = null;

  private constructor() {
    this.workspacePresenter = new WorkspacePresenter();
    this.appPresenter = new AppPresenter();
    this.configPresenter = new ConfigPresenter();
    this.sessionPresenter = new SessionPresenter();
    this.filePresenter = new FilePresenter(paths.effectiveProjectRoot);
    this.contentPresenter = new ContentPresenter();
    this.gitPresenter = new GitPresenter(paths.effectiveProjectRoot);
    this.mcpServerPresenter = new MCPServerPresenter();
    this.devPresenter = new DevPresenter();
    const mcpBridge = new MCPToolBridge(this.mcpServerPresenter);
    const skillPresenter = new SkillPresenter();
    this.gatewayPresenter = new GatewayPresenter();
    this.toolPresenter = new ToolPresenter(
      this.filePresenter,
      this.contentPresenter,
      browserSession,
      mcpBridge,
      skillPresenter,
      this.gatewayPresenter,
    );
    this.agentConfigPresenter = new AgentConfigPresenter();
    this.agentConfigPresenter.setSkillPresenter(skillPresenter);
    this.agentConfigPresenter.setConfigPresenter(this.configPresenter);
    this.agentChatEngine = new AgentChatPresenter(
      this.gatewayPresenter,
      this.toolPresenter,
      this.contentPresenter,
      skillPresenter,
      this.agentConfigPresenter,
      this.configPresenter,
    );
    this.agentChatPresenter = new AgentChatPresenterAdapter(
      this.agentChatEngine,
      this.gatewayPresenter,
    );
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.contentPresenter,
      this.gatewayPresenter,
    );
    agentInvokerRegistry.init(
      this.gatewayPresenter,
      this.toolPresenter,
      this.configPresenter,
      this.agentConfigPresenter,
      skillPresenter,
    );
    this.groupChatPresenter = new GroupChatPresenter(this.gatewayPresenter);
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
    "gatewayPresenter",
    "agentConfigPresenter",
    "agentChatPresenter",
    "mcpServerPresenter",
    "devPresenter",
    "groupChatPresenter",
  ]);

  private async syncVaultTrustedPath(): Promise<void> {
    const vaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as string | null;
    if (vaultPath) this.filePresenter.addTrustedPath(vaultPath);
  }

  async init(): Promise<void> {
    const port = (await this.configPresenter.get("gateway.port")) as number | null;
    await this.gatewayPresenter.init(port ?? undefined);
    await this.mcpServerPresenter.init();
    await this.agentConfigPresenter.init();
    await this.syncVaultTrustedPath();
    // Re-sync trusted path whenever config changes; re-init taskPresenter on vault path change
    eventBus.on("config:changed", async (key: string) => {
      this.syncVaultTrustedPath().catch(() => {});
      if (key === "obsidian.vaultPath") {
        const newVaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as
          | string
          | undefined;
        const { getDb } = await import("@/db");
        await taskPresenter.init(getDb(), newVaultPath ?? "", this.configPresenter);
      }
    });
    const vaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as string | undefined;
    {
      const { getDb } = await import("@/db");
      await taskPresenter.init(getDb(), vaultPath ?? "", this.configPresenter);
    }
    logger.info("Presenter initialized");
  }

  resetAgent(): void {
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.contentPresenter,
      this.gatewayPresenter,
    );
    logger.info("AgentPresenter reset");
  }

  async destroy(): Promise<void> {
    await browserSession.close();
    await this.gatewayPresenter.destroy();
    await taskPresenter.destroy();
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

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:openDirectoryOrFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "openFile"],
    filters: [{ name: "Skill", extensions: ["zip"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("shell:openPath", (_event, path: string) => {
  shell.openPath(path);
});
