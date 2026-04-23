export const CONFIG_EVENTS = {
  CHANGED: "config:changed",
} as const;

export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: "evolution:stage-changed",
  PROGRESS: "evolution:progress",
} as const;

export const CHAT_EVENTS = {
  MESSAGE: "chat:message",
  STREAM_CHUNK: "chat:stream-chunk",
} as const;

export const STREAM_EVENTS = {
  RESPONSE: "stream:response",
  END: "stream:end",
  ERROR: "stream:error",
  QUESTION: "stream:question",
} as const;

export const SESSION_EVENTS = {
  LIST_UPDATED: "session:list-updated",
  ACTIVATED: "session:activated",
} as const;

export const WORKFLOW_EVENTS = {
  UPDATED: "workflow:updated",
  STEP_UPDATED: "workflow:step-updated",
} as const;

export const TOOL_EVENTS = {
  CALL_START: "tool:call-start",
  CALL_END: "tool:call-end",
} as const;

export const WORKSPACE_EVENTS = {
  STATUS_CHANGED: "workspace:status-changed",
  INIT_PROGRESS: "workspace:init-progress",
} as const;
