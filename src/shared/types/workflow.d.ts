export type WorkflowStepStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed";

export interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
  status: WorkflowStepStatus;
}

export interface Workflow {
  sessionId: string;
  steps: WorkflowStep[];
}
