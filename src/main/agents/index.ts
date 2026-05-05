import type { AgentConfig } from "@shared/types/agent";
import { HAL } from "./hal";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  config: AgentConfig;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL];
