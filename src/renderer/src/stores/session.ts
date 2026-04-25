import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatSession } from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useSessionStore = defineStore("session", () => {
  const activeSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");

  /** 确保有一个会话：取已有的第一个，或创建新的 */
  async function ensureSession(): Promise<void> {
    const sessions: ChatSession[] = await sessionPresenter.getSessions();
    if (sessions.length > 0) {
      activeSessionId.value = sessions[0].id;
    } else {
      const session = await sessionPresenter.createSession();
      activeSessionId.value = session.id;
    }
  }

  function setActiveSession(id: string) {
    activeSessionId.value = id;
  }

  return {
    activeSessionId,
    ensureSession,
    setActiveSession,
  };
});
