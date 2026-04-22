import { defineStore } from "pinia";
import { ref } from "vue";

export type EvolutionStage =
  | "idle"
  | "discuss"
  | "design"
  | "coding"
  | "build"
  | "apply"
  | "completed"
  | "failed";

export interface EvolutionContext {
  request: string;
  requirements: Record<string, unknown>;
  stage: EvolutionStage;
  progress: number;
  error?: string;
}

export const useEvolutionStore = defineStore("evolution", () => {
  const stage = ref<EvolutionStage>("idle");
  const progress = ref(0);
  const context = ref<EvolutionContext | null>(null);

  function setStage(newStage: EvolutionStage): void {
    stage.value = newStage;
  }

  function setProgress(value: number): void {
    progress.value = Math.min(100, Math.max(0, value));
  }

  function reset(): void {
    stage.value = "idle";
    progress.value = 0;
    context.value = null;
  }

  return {
    stage,
    progress,
    context,
    setStage,
    setProgress,
    reset,
  };
});
