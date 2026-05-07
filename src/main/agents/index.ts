import { join } from "path";
import { app } from "electron";
import type { Agent } from "@shared/types/agent";
import { loadAgentsFromDir } from "./agentLoader";

function getBuiltinAgentsDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), "..", "resources", "agents");
  }
  return join(process.cwd(), "resources", "agents");
}

export function loadBuiltinAgents(): Agent[] {
  return loadAgentsFromDir(getBuiltinAgentsDir(), "builtin");
}

export const BUILTIN_AGENTS: Agent[] = loadBuiltinAgents();
export const HAL_AI: Agent = BUILTIN_AGENTS.find((a) => a.id === "hal-ai")!;
