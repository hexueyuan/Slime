import { ipcMain } from "electron";
import type { IpcChannel } from "@shared/types";
import type { IpcHandler } from "./types";
import { logger } from "@/utils";
import { registerAgentHandlers } from "./handlers/agent";
import { registerFileHandlers } from "./handlers/file";
import { registerGitHandlers } from "./handlers/git";
import { registerConfigHandlers } from "./handlers/config";
import { registerAppHandlers } from "./handlers/app";

export function registerHandler<C extends IpcChannel>(channel: C, handler: IpcHandler<C>): void {
  ipcMain.handle(channel, handler);
  logger.debug(`IPC handler registered: ${channel}`);
}

export function registerAllHandlers(): void {
  registerAppHandlers();
  registerAgentHandlers();
  registerFileHandlers();
  registerGitHandlers();
  registerConfigHandlers();
  logger.info("All IPC handlers registered");
}
