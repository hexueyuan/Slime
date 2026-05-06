export type ActorType = "user" | "agent";
export type RepeatPreset = "none" | "hourly" | "daily" | "weekly" | "monthly" | "custom";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface Task {
  id: string;
  title: string;
  detail?: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  creatorType: ActorType;
  creatorId?: string;
  assigneeType: ActorType;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}

export interface TaskAttachment {
  id: number;
  taskId: string;
  fileName: string;
  filePath: string;
  fileType: "image" | "doc" | "video";
  createdAt: number;
}

export type TimelineSource = "manual" | "task_auto" | "note";

export interface TimelineEntry {
  id: number;
  date: string;
  startTime: string;
  endTime?: string;
  content: string;
  source: TimelineSource;
  sourceId?: string;
  createdAt: number;
}

export interface Note {
  id: number;
  content: string;
  createdAt: number;
}
