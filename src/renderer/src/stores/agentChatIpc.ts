import { CHAT_STREAM_EVENTS } from "@shared/events";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { useAgentChatStore } from "./agentChat";

interface StreamResponseData {
  sessionId: string;
  messageId: string;
  blocks: AssistantMessageBlock[];
}

interface StreamEndData {
  sessionId: string;
  messageId: string;
}

interface StreamErrorData {
  sessionId: string;
  error: string;
}

export function setupAgentChatIpc(
  store: ReturnType<typeof useAgentChatStore>,
  activeSessionId: () => string | null,
): () => void {
  const unsubs: Array<() => void> = [];

  const unsubResponse = window.electron.ipcRenderer.on(
    CHAT_STREAM_EVENTS.RESPONSE,
    (data: unknown) => {
      const d = data as StreamResponseData;
      if (d.sessionId === activeSessionId()) {
        store.setStreamingState(d.messageId, d.blocks);
      }
    },
  );
  unsubs.push(unsubResponse);

  const unsubEnd = window.electron.ipcRenderer.on(CHAT_STREAM_EVENTS.END, (data: unknown) => {
    const d = data as StreamEndData;
    if (d.sessionId === activeSessionId()) {
      store.clearStreamingState();
      store.fetchMessages(d.sessionId);
    }
    store.isGenerating = false;
  });
  unsubs.push(unsubEnd);

  const unsubError = window.electron.ipcRenderer.on(CHAT_STREAM_EVENTS.ERROR, (data: unknown) => {
    const d = data as StreamErrorData;
    if (d.sessionId === activeSessionId()) {
      store.setError(d.error);
    }
  });
  unsubs.push(unsubError);

  return () => unsubs.forEach((fn) => fn());
}
