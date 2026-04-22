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
};
