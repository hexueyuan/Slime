import type {
  EvolutionStatus,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
  EvolutionContext,
} from "../evolution";

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  restart(): void;
  checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }>;
  readArchive(tag: string): Promise<EvolutionArchive | null>;
  runBuildVerification(): Promise<{ success: boolean; error?: string }>;
  restoreState(): Promise<EvolutionContext | null>;
  applyEvolution(): Promise<void>;
  retryPackage(): Promise<void>;
  skipPackage(): void;
}
