export interface WorkspaceStatus {
  ready: boolean;
  sourceDir: string;
  gitRemote: string;
  currentBranch?: string;
  lastError?: string;
}

export interface InitProgress {
  stage: "clone" | "install" | "done" | "error";
  message: string;
  percent?: number;
}

export interface IWorkspacePresenter {
  /** 是否需要初始化（仅打包模式且未初始化时返回 true） */
  needsInit(): Promise<boolean>;
  /** 检查 workspace 是否已初始化 */
  isReady(): Promise<boolean>;
  /** 初始化 workspace（clone + pnpm install），通过事件推送进度 */
  initialize(remote?: string): Promise<boolean>;
  /** 获取 workspace 状态 */
  getStatus(): Promise<WorkspaceStatus>;
  /** 获取当前 effectiveProjectRoot */
  getProjectRoot(): string;
}
