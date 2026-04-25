import type {
  EvolutionStatus,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
} from "../evolution";

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  restart(): void;
  checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }>;
  readArchive(tag: string): Promise<EvolutionArchive | null>;
}
