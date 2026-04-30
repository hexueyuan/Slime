import type BetterSqlite3 from "better-sqlite3";
import { getDb } from "@/db";
import * as mcpDao from "@/db/models/mcpDao";
import { eventBus } from "@/eventbus";
import { MCP_EVENTS } from "@shared/events";
import { MCPClient } from "@/mcp/mcpClient";
import { HealthChecker } from "@/mcp/healthChecker";
import { logger } from "@/utils";
import type { IMCPServerPresenter } from "@shared/types/presenters/mcpServer.presenter";
import type { MCPServer, MCPServerDashboard, MCPToolRecord } from "@shared/types/mcp";
import type { MCPServerConfig } from "@/mcp/types";

export class MCPServerPresenter implements IMCPServerPresenter {
  private clients = new Map<string, MCPClient>();
  private healthCheckers = new Map<string, HealthChecker>();

  getDb(): BetterSqlite3.Database {
    return getDb();
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    const servers = mcpDao.listServers(this.getDb());
    for (const s of servers) {
      if (s.enabled) {
        this.connectServer(s).catch((e) => {
          logger.warn("MCP server init connect failed", { name: s.name, error: String(e) });
        });
      }
    }
  }

  async destroy(): Promise<void> {
    for (const [, hc] of this.healthCheckers) {
      hc.stop();
    }
    this.healthCheckers.clear();
    for (const [, client] of this.clients) {
      await client.disconnect().catch(() => {});
    }
    this.clients.clear();
  }

  // --- CRUD ---

  async listServers(): Promise<MCPServerDashboard[]> {
    return mcpDao.listServers(this.getDb()).map((s) => ({
      ...s,
      status: this.getServerStatus(s.id),
      toolsCount: mcpDao.listToolsByServer(this.getDb(), s.id).length,
      error: this.clients.get(s.id)?.getError() ?? null,
    }));
  }

  async createServer(config: Omit<MCPServer, "createdAt" | "updatedAt">): Promise<MCPServer> {
    const server = mcpDao.createServer(this.getDb(), {
      ...config,
      id: config.id || crypto.randomUUID(),
    });
    if (server.enabled) {
      this.connectServer(server).catch(() => {});
    }
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
    return server;
  }

  async updateServer(
    id: string,
    data: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>,
  ): Promise<MCPServer> {
    await this.disconnectServer(id);
    const updated = mcpDao.updateServer(this.getDb(), id, data);
    if (!updated) throw new Error(`MCP server ${id} not found`);
    if (updated.enabled) {
      this.connectServer(updated).catch(() => {});
    }
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
    return updated;
  }

  async deleteServer(id: string): Promise<void> {
    await this.disconnectServer(id);
    mcpDao.deleteServer(this.getDb(), id);
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
  }

  async getServerTools(id: string): Promise<MCPToolRecord[]> {
    return mcpDao.listToolsByServer(this.getDb(), id);
  }

  // --- Session state ---

  async getSessionDisabledTools(sessionId: string): Promise<number[]> {
    return mcpDao.getSessionDisabledToolIds(this.getDb(), sessionId);
  }

  async setSessionToolState(sessionId: string, toolId: number, disabled: boolean): Promise<void> {
    mcpDao.setSessionToolState(this.getDb(), sessionId, toolId, disabled);
  }

  // --- Internal ---

  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }

  private getServerStatus(serverId: string): MCPServerDashboard["status"] {
    const client = this.clients.get(serverId);
    return client?.getStatus() ?? "disconnected";
  }

  private async connectServer(server: MCPServer): Promise<void> {
    const config: MCPServerConfig = {
      id: server.id,
      name: server.name,
      transport: server.transport,
      command: server.command ?? undefined,
      args: server.args ?? undefined,
      env: server.env ?? undefined,
      url: server.url ?? undefined,
      headers: server.httpHeaders ?? undefined,
    };

    const client = new MCPClient();
    await client.connect(config);

    const tools = await client.listTools();
    mcpDao.deleteStaleTools(
      this.getDb(),
      server.id,
      tools.map((t) => t.name),
    );
    for (const t of tools) {
      mcpDao.upsertTool(this.getDb(), server.id, t.name, t.description, t.inputSchema);
    }

    this.clients.set(server.id, client);

    const hc = new HealthChecker(client, server.id, server.name, eventBus, async () => {
      const ts = await client.listTools();
      mcpDao.deleteStaleTools(
        this.getDb(),
        server.id,
        ts.map((t) => t.name),
      );
      for (const t of ts) {
        mcpDao.upsertTool(this.getDb(), server.id, t.name, t.description, t.inputSchema);
      }
      eventBus.sendToRenderer(MCP_EVENTS.TOOLS_CHANGED, { serverId: server.id });
    });
    hc.start();
    this.healthCheckers.set(server.id, hc);

    eventBus.sendToRenderer(MCP_EVENTS.SERVER_STATUS, {
      serverId: server.id,
      status: "connected",
      error: null,
    });
  }

  private async disconnectServer(id: string): Promise<void> {
    const hc = this.healthCheckers.get(id);
    if (hc) {
      hc.stop();
      this.healthCheckers.delete(id);
    }
    const client = this.clients.get(id);
    if (client) {
      await client.disconnect().catch(() => {});
      this.clients.delete(id);
    }
  }
}
