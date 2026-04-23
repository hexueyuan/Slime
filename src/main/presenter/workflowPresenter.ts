import type { Workflow, WorkflowStep, WorkflowStepStatus } from "@shared/types/workflow";
import { WORKFLOW_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";

export class WorkflowPresenter {
  private workflows = new Map<string, Workflow>();

  editWorkflow(
    sessionId: string,
    steps: Array<{ id: string; title: string; description?: string }>,
  ): Workflow {
    const workflow: Workflow = {
      sessionId,
      steps: steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: "pending" as const,
      })),
    };
    this.workflows.set(sessionId, workflow);
    eventBus.sendToRenderer(WORKFLOW_EVENTS.UPDATED, sessionId, workflow);
    return workflow;
  }

  queryWorkflow(sessionId: string): Workflow | null {
    return this.workflows.get(sessionId) ?? null;
  }

  queryStep(sessionId: string, stepId: string): WorkflowStep | null {
    const workflow = this.workflows.get(sessionId);
    if (!workflow) return null;
    return workflow.steps.find((s) => s.id === stepId) ?? null;
  }

  updateStep(sessionId: string, stepId: string, status: WorkflowStepStatus): WorkflowStep | null {
    const workflow = this.workflows.get(sessionId);
    if (!workflow) return null;
    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) return null;
    step.status = status;
    eventBus.sendToRenderer(WORKFLOW_EVENTS.STEP_UPDATED, sessionId, step);
    return step;
  }
}
