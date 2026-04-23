import { ipcMain } from "electron";
import type { IPresenter } from "@shared/types/presenters";
import { AppPresenter } from "./appPresenter";
import { ConfigPresenter } from "./configPresenter";
import { AgentPresenter } from "./agentPresenter";
import { SessionPresenter } from "./sessionPresenter";
import { FilePresenter } from "./filePresenter";
import { GitPresenter } from "./gitPresenter";
import { logger } from "@/utils";

type DispatchableKey = Exclude<keyof IPresenter, "init" | "destroy">;

export class Presenter implements IPresenter {
  appPresenter: AppPresenter;
  configPresenter: ConfigPresenter;
  agentPresenter: AgentPresenter;
  sessionPresenter: SessionPresenter;
  filePresenter: FilePresenter;
  gitPresenter: GitPresenter;

  private static instance: Presenter | null = null;

  private constructor() {
    this.appPresenter = new AppPresenter();
    this.configPresenter = new ConfigPresenter();
    this.sessionPresenter = new SessionPresenter();
    this.agentPresenter = new AgentPresenter(this.sessionPresenter, this.configPresenter);
    this.filePresenter = new FilePresenter();
    this.gitPresenter = new GitPresenter();
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
  ]);

  init(): void {
    logger.info("Presenter initialized");
  }

  async destroy(): Promise<void> {
    logger.info("Presenter destroyed");
  }
}

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
