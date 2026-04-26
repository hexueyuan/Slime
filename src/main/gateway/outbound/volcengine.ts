import { createOpenAIChatOutbound } from "./openai-chat";
import type { OutboundAdapter } from "./types";

export function createVolcengineOutbound(): OutboundAdapter {
  return createOpenAIChatOutbound();
}
