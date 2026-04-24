export type EvolutionStage = "idle" | "discuss" | "coding" | "applying";

export interface EvolutionPlan {
  scope: string[];
  changes: string[];
  risks?: string[];
}

export interface EvolutionNode {
  id: string;
  tag: string;
  description: string;
  request: string;
  changes: string[];
  createdAt: string;
  gitRef: string;
  parent?: string;
}

export interface EvolutionStatus {
  stage: EvolutionStage;
  description?: string;
  plan?: EvolutionPlan;
  startCommit?: string;
}
