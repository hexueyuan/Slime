import type { IAppPresenter } from "./app.presenter";
import type { IConfigPresenter } from "./config.presenter";
import type { IAgentPresenter } from "./agent.presenter";
import type { ISessionPresenter } from "./session.presenter";
import type { IFilePresenter } from "./file.presenter";
import type { IGitPresenter } from "./git.presenter";
import type { IWorkspacePresenter } from "./workspace.presenter";
import type { IContentPresenter } from "./content.presenter";
import type { IGatewayPresenter } from "./gateway.presenter";
import type { IAgentConfigPresenter } from "./agentConfig.presenter";
import type { IAgentChatPresenter } from "./agentChat.presenter";
import type { IMCPServerPresenter } from "./mcpServer.presenter";
import type { IDevPresenter } from "./dev.presenter";
import type { IGroupChatPresenter } from "./groupChat.presenter";

export type { IAppPresenter } from "./app.presenter";
export type { IConfigPresenter } from "./config.presenter";
export type { IAgentPresenter } from "./agent.presenter";
export type { ISessionPresenter } from "./session.presenter";
export type { IFilePresenter, DirEntry } from "./file.presenter";
export type { IGitPresenter } from "./git.presenter";
export type { IWorkspacePresenter, WorkspaceStatus, InitProgress } from "./workspace.presenter";
export type { IContentPresenter } from "./content.presenter";
export type { IGatewayPresenter } from "./gateway.presenter";
export type { IAgentConfigPresenter } from "./agentConfig.presenter";
export type { IAgentChatPresenter } from "./agentChat.presenter";
export type { IDevPresenter, BuiltinAgentInfo, SkillManifest } from "./dev.presenter";
export type { IGroupChatPresenter } from "./groupChat.presenter";

export interface IPresenter {
  appPresenter: IAppPresenter;
  configPresenter: IConfigPresenter;
  agentPresenter: IAgentPresenter;
  sessionPresenter: ISessionPresenter;
  filePresenter: IFilePresenter;
  gitPresenter: IGitPresenter;
  workspacePresenter: IWorkspacePresenter;
  contentPresenter: IContentPresenter;
  gatewayPresenter: IGatewayPresenter;
  agentConfigPresenter: IAgentConfigPresenter;
  agentChatPresenter: IAgentChatPresenter;
  mcpServerPresenter: IMCPServerPresenter;
  devPresenter: IDevPresenter;
  groupChatPresenter: IGroupChatPresenter;
  init(): void | Promise<void>;
  destroy(): Promise<void>;
}
