import type BetterSqlite3 from "better-sqlite3";
import * as agentDao from "@/db/models/agentDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as mcpDao from "@/db/models/mcpDao";
import type { MCPServerPresenter } from "./mcpServerPresenter";
import type { Tool } from "@/llm";
function serverNameToPrefix(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export class MCPToolBridge {
  constructor(private mcpPresenter: MCPServerPresenter) {}

  private get db(): BetterSqlite3.Database {
    return this.mcpPresenter.getDb();
  }

  async getMcpTools(sessionId: string): Promise<Record<string, Tool>> {
    const session = sessionDao.getSessionById(this.db, sessionId);
    if (!session) return {};

    const agent = agentDao.getAgentById(this.db, session.agentId);
    const mcpTools = agent?.config?.mcpTools;
    if (!mcpTools || mcpTools.length === 0) return {};

    const disabledIds = mcpDao.getSessionDisabledToolIds(this.db, sessionId);
    const disabledSet = new Set(disabledIds);

    const result: Record<string, Tool> = {};

    for (const entry of mcpTools) {
      const slashIdx = entry.indexOf("/");
      if (slashIdx === -1) continue;
      const serverId = entry.slice(0, slashIdx);
      const toolName = entry.slice(slashIdx + 1);

      const toolRecord = mcpDao.getToolByServerAndName(this.db, serverId, toolName);
      if (!toolRecord) continue;
      if (disabledSet.has(toolRecord.id)) continue;

      const server = mcpDao.getServer(this.db, serverId);
      const prefix = serverNameToPrefix(server?.name ?? serverId);
      const fullName = `mcp_${prefix}_${toolName}`;

      result[fullName] = {
        description: toolRecord.description ?? `MCP tool: ${toolName}`,
        parameters: toolRecord.inputSchema,
      };
    }

    return result;
  }

  async executeTool(fullName: string, args: unknown): Promise<string> {
    if (!fullName.startsWith("mcp_")) throw new Error(`Not an MCP tool: ${fullName}`);

    const servers = mcpDao.listServers(this.db);
    for (const server of servers) {
      const prefix = serverNameToPrefix(server.name);
      const candidatePrefix = `mcp_${prefix}_`;
      if (!fullName.startsWith(candidatePrefix)) continue;

      const toolName = fullName.slice(candidatePrefix.length);
      const client = this.mcpPresenter.getClient(server.id);
      if (!client || client.getStatus() !== "connected") {
        return `MCP tool '${fullName}' unavailable: server '${server.name}' is not connected`;
      }

      try {
        return await client.callTool(toolName, args);
      } catch (e) {
        return `MCP tool '${fullName}' failed: ${String(e)}`;
      }
    }

    return `MCP tool '${fullName}' not found`;
  }
}
