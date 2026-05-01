import { join } from "path";

interface AgentLike {
  id: string;
  name: string;
  type: string;
}

/**
 * 返回 Agent 工作目录。
 * - builtin agent 返回 null（不使用文件目录）
 * - 有 vaultPath → {vault}/Slime/{agent.name}/
 * - 无 vaultPath → {defaultAgentsDir}/{agent.id}/
 */
export function getAgentDir(
  agent: AgentLike,
  vaultPath: string | null,
  defaultAgentsDir: string,
): string | null {
  if (agent.type === "builtin") return null;
  if (vaultPath) return join(vaultPath, "Slime", agent.name);
  return join(defaultAgentsDir, agent.id);
}

/** SOUL.md 绝对路径 */
export function getSoulPath(agentDir: string): string {
  return join(agentDir, "SOUL.md");
}

/** skills 子目录绝对路径 */
export function getSkillsDir(agentDir: string): string {
  return join(agentDir, "skills");
}
