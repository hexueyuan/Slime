import type { IAppPresenter } from "./app.presenter";
import type { IConfigPresenter } from "./config.presenter";
import type { IAgentPresenter } from "./agent.presenter";
import type { IFilePresenter } from "./file.presenter";
import type { IGitPresenter } from "./git.presenter";

export type { IAppPresenter } from "./app.presenter";
export type { IConfigPresenter } from "./config.presenter";
export type { IAgentPresenter, Message } from "./agent.presenter";
export type { IFilePresenter } from "./file.presenter";
export type { IGitPresenter } from "./git.presenter";

export interface IPresenter {
  appPresenter: IAppPresenter;
  configPresenter: IConfigPresenter;
  agentPresenter: IAgentPresenter;
  filePresenter: IFilePresenter;
  gitPresenter: IGitPresenter;
  init(): void;
  destroy(): Promise<void>;
}
