import { AgentInvoker } from "./agentInvoker";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";

export class AgentInvokerRegistry {
  private invokers = new Map<string, AgentInvoker>();
  private gatewayPresenter!: GatewayPresenter;
  private toolPresenter!: ToolPresenter;

  init(gatewayPresenter: GatewayPresenter, toolPresenter: ToolPresenter): void {
    this.gatewayPresenter = gatewayPresenter;
    this.toolPresenter = toolPresenter;
  }

  get(agentId: string): AgentInvoker {
    if (!this.gatewayPresenter || !this.toolPresenter) {
      throw new Error("AgentInvokerRegistry not initialized. Call init() first.");
    }
    if (!this.invokers.has(agentId)) {
      this.invokers.set(
        agentId,
        new AgentInvoker(agentId, this.gatewayPresenter, this.toolPresenter),
      );
    }
    return this.invokers.get(agentId)!;
  }

  stopAll(sessionId: string): void {
    for (const invoker of this.invokers.values()) {
      invoker.stop(sessionId);
    }
  }
}

export const agentInvokerRegistry = new AgentInvokerRegistry();
