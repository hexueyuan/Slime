import type { IAppPresenter } from "./app.presenter";
import type { IConfigPresenter } from "./config.presenter";
import type { IAgentPresenter } from "./agent.presenter";
import type { ISessionPresenter } from "./session.presenter";
import type { IFilePresenter } from "./file.presenter";
import type { IGitPresenter } from "./git.presenter";
import type { IWorkspacePresenter } from "./workspace.presenter";

export type { IAppPresenter } from "./app.presenter";
export type { IConfigPresenter } from "./config.presenter";
export type { IAgentPresenter } from "./agent.presenter";
export type { ISessionPresenter } from "./session.presenter";
export type { IFilePresenter } from "./file.presenter";
export type { IGitPresenter } from "./git.presenter";
export type { IWorkspacePresenter, WorkspaceStatus, InitProgress } from "./workspace.presenter";

export interface IPresenter {
  appPresenter: IAppPresenter;
  configPresenter: IConfigPresenter;
  agentPresenter: IAgentPresenter;
  sessionPresenter: ISessionPresenter;
  filePresenter: IFilePresenter;
  gitPresenter: IGitPresenter;
  workspacePresenter: IWorkspacePresenter;
  init(): void;
  destroy(): Promise<void>;
}
