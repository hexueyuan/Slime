import { defineStore } from "pinia";
import { ref } from "vue";
import type { Workflow, WorkflowStep } from "@shared/types/workflow";
import { WORKFLOW_EVENTS } from "@shared/events";

export const useWorkflowStore = defineStore("workflow", () => {
  const workflow = ref<Workflow | null>(null);

  function setWorkflow(wf: Workflow): void {
    workflow.value = wf;
  }

  function updateStep(step: WorkflowStep): void {
    if (!workflow.value) return;
    const idx = workflow.value.steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) {
      workflow.value.steps[idx] = step;
    }
  }

  function reset(): void {
    workflow.value = null;
  }

  return { workflow, setWorkflow, updateStep, reset };
});

export function setupWorkflowIpc(store: ReturnType<typeof useWorkflowStore>): () => void {
  const unsubs: Array<() => void> = [];

  const unsubUpdated = window.electron.ipcRenderer.on(
    WORKFLOW_EVENTS.UPDATED,
    (_sessionId: unknown, wf: unknown) => {
      store.setWorkflow(wf as Workflow);
    },
  );
  unsubs.push(unsubUpdated);

  const unsubStep = window.electron.ipcRenderer.on(
    WORKFLOW_EVENTS.STEP_UPDATED,
    (_sessionId: unknown, step: unknown) => {
      store.updateStep(step as WorkflowStep);
    },
  );
  unsubs.push(unsubStep);

  return () => unsubs.forEach((fn) => fn());
}
