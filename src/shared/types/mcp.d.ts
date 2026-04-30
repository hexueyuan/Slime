export interface MCPServer {
  id: string;
  name: string;
  transport: "stdio" | "http";
  enabled: boolean;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  httpHeaders?: Record<string, string> | null;
  createdAt: number;
  updatedAt: number;
}

export interface MCPServerDashboard extends MCPServer {
  status: "disconnected" | "connecting" | "connected" | "error";
  toolsCount: number;
  error?: string | null;
}

export interface MCPToolRecord {
  id: number;
  serverId: string;
  toolName: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}
