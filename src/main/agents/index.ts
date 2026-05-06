import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import { HAL } from "./hal";
import { MOSS } from "./moss";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL, MOSS];
