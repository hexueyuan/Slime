import { registerHandler } from "../index";
import { logger } from "@/utils";

export function registerFileHandlers(): void {
  registerHandler("file:read", async (_event, args) => {
    logger.debug("file:read called", { path: args.path });
    // TODO: 实现文件读取
    return { content: "" };
  });

  registerHandler("file:write", async (_event, args) => {
    logger.debug("file:write called", { path: args.path });
    // TODO: 实现文件写入
    return { success: false };
  });
}
