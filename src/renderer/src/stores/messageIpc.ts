import { STREAM_EVENTS } from "@shared/events";
import type { AssistantMessageBlock, PendingQuestion } from "@shared/types/chat";
import type { useMessageStore } from "./chat";

export function setupMessageIpc(store: ReturnType<typeof useMessageStore>): () => void {
  const unsubs: Array<() => void> = [];

  const unsubResponse = window.electron.ipcRenderer.on(
    STREAM_EVENTS.RESPONSE,
    (sessionId: unknown, messageId: unknown, blocks: unknown) => {
      store.setStreamingState(
        sessionId as string,
        messageId as string,
        blocks as AssistantMessageBlock[],
      );
    },
  );
  unsubs.push(unsubResponse);

  const unsubEnd = window.electron.ipcRenderer.on(
    STREAM_EVENTS.END,
    (sessionId: unknown, _messageId: unknown) => {
      store.clearStreamingState();
      store.loadMessages(sessionId as string);
    },
  );
  unsubs.push(unsubEnd);

  const unsubError = window.electron.ipcRenderer.on(
    STREAM_EVENTS.ERROR,
    (_sessionId: unknown, error: unknown) => {
      store.clearStreamingState();
      store.setStreamError(String(error));
    },
  );
  unsubs.push(unsubError);

  const unsubQuestion = window.electron.ipcRenderer.on(
    STREAM_EVENTS.QUESTION,
    (_sessionId: unknown, payload: unknown) => {
      store.setPendingQuestion(payload as PendingQuestion);
    },
  );
  unsubs.push(unsubQuestion);

  return () => unsubs.forEach((fn) => fn());
}
