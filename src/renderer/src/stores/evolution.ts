import { ref } from "vue";
import { defineStore } from "pinia";
import type { EvolutionStage } from "@shared/types/evolution";
import { EVOLUTION_EVENTS } from "@shared/events";

export const useEvolutionStore = defineStore("evolution", () => {
  const stage = ref<EvolutionStage>("idle");
  const completedTag = ref<string | null>(null);
  const completedSummary = ref<string | null>(null);
  const rollbackInProgress = ref(false);
  const rollbackTag = ref<string | null>(null);
  const recoveryContext = ref<{
    stage: string;
    description: string;
    sessionId: string;
  } | null>(null);

  function setStage(s: EvolutionStage) {
    stage.value = s;
    if (s !== "idle") {
      completedTag.value = null;
      completedSummary.value = null;
    }
  }

  function setCompleted(tag: string, summary: string) {
    completedTag.value = tag;
    completedSummary.value = summary;
  }

  function setRecovery(ctx: { stage: string; description: string; sessionId: string } | null) {
    recoveryContext.value = ctx;
  }

  function reset() {
    stage.value = "idle";
    completedTag.value = null;
    completedSummary.value = null;
    rollbackInProgress.value = false;
    rollbackTag.value = null;
    recoveryContext.value = null;
  }

  return {
    stage,
    completedTag,
    completedSummary,
    rollbackInProgress,
    rollbackTag,
    recoveryContext,
    setStage,
    setCompleted,
    setRecovery,
    reset,
  };
});

export function setupEvolutionIpc(store: ReturnType<typeof useEvolutionStore>) {
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.STAGE_CHANGED, (...args: unknown[]) => {
    store.setStage(args[0] as EvolutionStage);
  });
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, (...args: unknown[]) => {
    store.setCompleted(args[0] as string, args[1] as string);
  });
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.ROLLBACK_STARTED, (...args: unknown[]) => {
    store.rollbackInProgress = true;
    store.rollbackTag = args[0] as string;
  });
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.ROLLBACK_COMPLETED, () => {
    store.rollbackInProgress = false;
    store.rollbackTag = null;
  });
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.ROLLBACK_FAILED, () => {
    store.rollbackInProgress = false;
    store.rollbackTag = null;
  });
}
