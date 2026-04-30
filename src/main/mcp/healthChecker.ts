import type { MCPClient } from "./mcpClient";
import type { EventBus } from "@/eventbus";
import { MCP_EVENTS } from "@shared/events";
import { logger } from "@/utils";

export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 0;
  private readonly PING_INTERVAL = 30000;
  private readonly MAX_BACKOFF = 60000;

  constructor(
    private client: MCPClient,
    private serverId: string,
    private serverName: string,
    private eventBus: EventBus,
    private onReconnect: () => Promise<void>,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.ping(), this.PING_INTERVAL);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  private async ping(): Promise<void> {
    try {
      await this.client.listTools();
      this.retryDelay = 0;
    } catch {
      logger.warn("MCP health check failed", { name: this.serverName });
      this.emitStatus("error", "Health check failed");
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    this.retryDelay = Math.min(
      this.retryDelay === 0 ? 1000 : this.retryDelay * 2,
      this.MAX_BACKOFF,
    );
    this.retryTimer = setTimeout(() => this.retry(), this.retryDelay);
  }

  private async retry(): Promise<void> {
    try {
      this.emitStatus("connecting");
      const config = this.client.getConfig();
      if (!config) return;
      await this.client.disconnect();
      await this.client.connect(config);
      await this.onReconnect();
      this.retryDelay = 0;
      this.emitStatus("connected");
    } catch {
      this.emitStatus("error", `Reconnect failed (attempt backoff ${this.retryDelay}ms)`);
      this.scheduleRetry();
    }
  }

  private emitStatus(status: string, error?: string): void {
    this.eventBus.sendToRenderer(MCP_EVENTS.SERVER_STATUS, {
      serverId: this.serverId,
      status,
      error: error ?? null,
    });
  }
}
