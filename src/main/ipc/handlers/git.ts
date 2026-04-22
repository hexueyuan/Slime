import { registerHandler } from "../index";
import { logger } from "@/utils";

export function registerGitHandlers(): void {
  registerHandler("git:tag", async (_event, args) => {
    logger.debug("git:tag called", { name: args.name });
    // TODO: 实现 Git tag
    return { success: false };
  });
}
