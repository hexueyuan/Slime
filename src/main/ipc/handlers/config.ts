import { registerHandler } from "../index";
import { logger } from "@/utils";

export function registerConfigHandlers(): void {
  registerHandler("config:get", async (_event, args) => {
    logger.debug("config:get called", { key: args.key });
    // TODO: 实现配置读取
    return { value: null };
  });

  registerHandler("config:set", async (_event, args) => {
    logger.debug("config:set called", { key: args.key });
    // TODO: 实现配置写入
    return { success: false };
  });
}
