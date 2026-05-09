import { AgentInvoker } from "./agentInvoker";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";
import type { ConfigPresenter } from "../configPresenter";
import type { AgentConfigPresenter } from "../agentConfigPresenter";
import type { SkillPresenter } from "../skillPresenter";

export class AgentInvokerRegistry {
  private invokers = new Map<string, AgentInvoker>();
  private gatewayPresenter!: GatewayPresenter;
  private toolPresenter!: ToolPresenter;
  private configPresenter!: ConfigPresenter;
  private agentConfigPresenter!: AgentConfigPresenter;
  private skillPresenter!: SkillPresenter;

  init(
    gatewayPresenter: GatewayPresenter,
    toolPresenter: ToolPresenter,
    configPresenter: ConfigPresenter,
    agentConfigPresenter: AgentConfigPresenter,
    skillPresenter: SkillPresenter,
  ): void {
    this.gatewayPresenter = gatewayPresenter;
    this.toolPresenter = toolPresenter;
    this.configPresenter = configPresenter;
    this.agentConfigPresenter = agentConfigPresenter;
    this.skillPresenter = skillPresenter;
  }

  get(agentId: string): AgentInvoker {
    if (!this.gatewayPresenter || !this.toolPresenter) {
      throw new Error("AgentInvokerRegistry not initialized. Call init() first.");
    }
    if (!this.invokers.has(agentId)) {
      this.invokers.set(
        agentId,
        new AgentInvoker(
          agentId,
          this.gatewayPresenter,
          this.toolPresenter,
          this.configPresenter,
          this.agentConfigPresenter,
          this.skillPresenter,
        ),
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
