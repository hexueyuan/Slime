import { GROUP_CHAT_EVENTS } from "@shared/events";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { useGroupChatStore } from "./groupChat";
import type { useGroupChatSessionStore } from "./groupChatSession";

interface MessageAddedData {
  sessionId: string;
  message: GroupChatMessageRecord;
}

interface AgentTypingData {
  sessionId: string;
  agentId: string;
  isTyping: boolean;
}

interface DetachedWindowClosedData {
  sessionId: string;
}

export function setupGroupChatIpc(
  chatStore: ReturnType<typeof useGroupChatStore>,
  sessionStore: ReturnType<typeof useGroupChatSessionStore>,
  activeSessionId: () => string | null,
): () => void {
  const unsubs: Array<() => void> = [];

  const unsubMessage = window.electron.ipcRenderer.on(
    GROUP_CHAT_EVENTS.MESSAGE_ADDED,
    (data: unknown) => {
      const d = data as MessageAddedData;
      if (d.sessionId === activeSessionId()) {
        chatStore.addMessage(d.message);
      }
    },
  );
  unsubs.push(unsubMessage);

  const unsubTyping = window.electron.ipcRenderer.on(
    GROUP_CHAT_EVENTS.AGENT_TYPING,
    (data: unknown) => {
      const d = data as AgentTypingData;
      if (d.sessionId === activeSessionId()) {
        chatStore.setTyping(d.agentId, d.isTyping);
      }
    },
  );
  unsubs.push(unsubTyping);

  const unsubDetachedClosed = window.electron.ipcRenderer.on(
    GROUP_CHAT_EVENTS.DETACHED_CLOSED,
    (data: unknown) => {
      const d = data as DetachedWindowClosedData;
      sessionStore.unmarkDetached(d.sessionId);
      if (d.sessionId === activeSessionId()) {
        chatStore.fetchMessages(d.sessionId);
      }
    },
  );
  unsubs.push(unsubDetachedClosed);

  return () => unsubs.forEach((fn) => fn());
}
