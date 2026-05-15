import { app } from "electron";
import { join } from "path";

export const paths = {
  get userData() {
    return app.getPath("userData");
  },

  get slimeDir() {
    return join(this.userData, ".slime");
  },

  get stateDir() {
    return join(this.slimeDir, "state");
  },

  get configDir() {
    return join(this.slimeDir, "config");
  },

  get dataDir() {
    return join(this.slimeDir, "data");
  },

  get avatarsDir() {
    return join(this.slimeDir, "avatars");
  },

  get logsDir() {
    return join(this.userData, "logs");
  },

  get projectRoot() {
    return app.isPackaged ? join(app.getAppPath(), "..") : process.cwd();
  },

  get configFile() {
    return join(this.configDir, "slime.config.json");
  },

  get contextFile() {
    return join(this.stateDir, "context.json");
  },

  // === workspace 相关路径 ===

  get workspaceDir() {
    return join(this.slimeDir, "workspace");
  },

  get sourceDir() {
    return join(this.workspaceDir, "slime-src");
  },

  get workspaceReadyFile() {
    return join(this.workspaceDir, ".ready");
  },

  get builtinSkillsDir() {
    return join(this.projectRoot, "resources", "skills");
  },

  get agentsDir(): string {
    return join(this.slimeDir, "agents");
  },

  get marketDir() {
    return join(app.getPath("home"), ".slime", "slime-market");
  },

  get marketAgentsDir() {
    return join(this.marketDir, "agents");
  },

  get marketSkillsDir() {
    return join(this.marketDir, "skills");
  },

  get slimeHomeDir() {
    if (process.env.SLIME_HOME_DIR) {
      return process.env.SLIME_HOME_DIR;
    }

    if (process.env.SLIME_E2E_USER_DATA || process.env.SLIME_USER_DATA_DIR) {
      return join(this.userData, ".slime-home");
    }

    return join(app.getPath("home"), ".slime");
  },

  get sessionsDir() {
    return join(this.slimeHomeDir, "sessions");
  },

  sessionWorkDir(sessionId: string) {
    return join(this.sessionsDir, sessionId);
  },

  /** 实际操作的项目根目录：打包后用 sourceDir，开发时用 cwd */
  get effectiveProjectRoot() {
    return app.isPackaged ? this.sourceDir : process.cwd();
  },
};
