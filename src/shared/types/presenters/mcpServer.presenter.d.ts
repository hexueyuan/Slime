import type { MCPServer, MCPServerDashboard, MCPToolRecord } from "../mcp";

export interface IMCPServerPresenter {
  listServers(): Promise<MCPServerDashboard[]>;
  createServer(config: Omit<MCPServer, "createdAt" | "updatedAt">): Promise<MCPServer>;
  updateServer(
    id: string,
    config: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>,
  ): Promise<MCPServer>;
  deleteServer(id: string): Promise<void>;
  getServerTools(id: string): Promise<MCPToolRecord[]>;
  getSessionDisabledTools(sessionId: string): Promise<number[]>;
  setSessionToolState(sessionId: string, toolId: number, disabled: boolean): Promise<void>;
}
