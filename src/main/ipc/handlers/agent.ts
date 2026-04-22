import { registerHandler } from "../index";
import { logger } from "@/utils";

export function registerAgentHandlers(): void {
  registerHandler("agent:chat", async (_event, args) => {
    logger.debug("agent:chat called", { messageCount: args.messages.length });
    // TODO: 实现 Claude API 调用
    return { content: "Agent chat not implemented yet" };
  });
}
