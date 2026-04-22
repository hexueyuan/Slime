import type { IAgentPresenter, Message } from "@shared/types/presenters";
import { logger } from "@/utils";

export class AgentPresenter implements IAgentPresenter {
  async chat(params: { messages: Message[]; stream?: boolean }): Promise<{ content: string }> {
    logger.debug("agent:chat called", { messageCount: params.messages.length });
    // TODO: 实现 Claude API 调用
    return { content: "Agent chat not implemented yet" };
  }
}
