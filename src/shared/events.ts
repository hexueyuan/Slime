export const CONFIG_EVENTS = {
  CHANGED: "config:changed",
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

export const TOOL_EVENTS = {
  CALL_START: "tool:call-start",
  CALL_END: "tool:call-end",
} as const;

export const WORKSPACE_EVENTS = {
  STATUS_CHANGED: "workspace:status-changed",
  INIT_PROGRESS: "workspace:init-progress",
} as const;

export const CONTENT_EVENTS = {
  UPDATED: "content:updated",
  CLEARED: "content:cleared",
} as const;

export const GATEWAY_EVENTS = {
  LOG_ADDED: "gateway:log-added",
} as const;

export const AGENT_EVENTS = {
  CHANGED: "agent:changed",
} as const;

export const CHAT_STREAM_EVENTS = {
  RESPONSE: "chat:stream:response",
  END: "chat:stream:end",
  ERROR: "chat:stream:error",
} as const;

export const MCP_EVENTS = {
  SERVERS_CHANGED: "mcp:servers-changed",
  SERVER_STATUS: "mcp:server-status",
  TOOLS_CHANGED: "mcp:tools-changed",
} as const;

export const TASK_EVENTS = {
  TASKS_CHANGED: "task:tasks-changed",
  TIMELINE_CHANGED: "task:timeline-changed",
} as const;

export const GROUP_CHAT_EVENTS = {
  MESSAGE_ADDED: "group_chat:message_added", // { sessionId, message: GroupChatMessageRecord }
  AGENT_TYPING: "group_chat:agent_typing", // { sessionId, agentId, isTyping: boolean }
  DETACHED_CLOSED: "group_chat:detached_closed", // { sessionId }
} as const;
