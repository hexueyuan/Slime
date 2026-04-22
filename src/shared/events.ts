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
