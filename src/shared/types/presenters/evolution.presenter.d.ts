import type { EvolutionStatus, EvolutionNode } from "../evolution";

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  rollback(tag: string): Promise<boolean>;
  restart(): void;
}
