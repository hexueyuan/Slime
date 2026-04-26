import { createOpenAIChatOutbound } from "./openai-chat";
import type { OutboundAdapter } from "./types";

export function createCustomOutbound(): OutboundAdapter {
  return createOpenAIChatOutbound();
}
