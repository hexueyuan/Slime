import { ref } from "vue";
import { defineStore } from "pinia";
import type { EvolutionStage } from "@shared/types/evolution";
import { EVOLUTION_EVENTS } from "@shared/events";

export const useEvolutionStore = defineStore("evolution", () => {
  const stage = ref<EvolutionStage>("idle");
  const completedTag = ref<string | null>(null);
  const completedSummary = ref<string | null>(null);

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

  function reset() {
    stage.value = "idle";
    completedTag.value = null;
    completedSummary.value = null;
  }

  return { stage, completedTag, completedSummary, setStage, setCompleted, reset };
});

export function setupEvolutionIpc(store: ReturnType<typeof useEvolutionStore>) {
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.STAGE_CHANGED, (_stage: EvolutionStage) => {
    store.setStage(_stage);
  });
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, (tag: string, summary: string) => {
    store.setCompleted(tag, summary);
  });
}
