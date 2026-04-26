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
  archived?: boolean;
}

export interface EvolutionArchive {
  version: 1;
  tag: string;
  parentTag: string | null;
  request: string;
  summary: string;
  plan: EvolutionPlan;
  createdAt: string;
  startCommit: string;
  endCommit: string;
  changedFiles: string[];
  semanticSummary: string;
  status: "active" | "archived";
  archivedAt?: string;
  archivedReason?: string;
}

export interface EvolutionDependency {
  tag: string;
  summary: string;
  overlappingFiles: string[];
}

export interface EvolutionStatus {
  stage: EvolutionStage;
  description?: string;
  plan?: EvolutionPlan;
  startCommit?: string;
  sessionId?: string;
}

export interface EvolutionContext {
  stage: EvolutionStage;
  description: string;
  plan?: EvolutionPlan;
  startCommit: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyProgress {
  step: "committing" | "packaging" | "replacing";
  message: string;
  error?: string;
}
