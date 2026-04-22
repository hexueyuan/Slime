import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatSession } from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useSessionStore = defineStore("session", () => {
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");

  async function fetchSessions(): Promise<void> {
    sessions.value = await sessionPresenter.getSessions();
  }

  async function createSession(title?: string): Promise<ChatSession> {
    const session = await sessionPresenter.createSession(title);
    sessions.value.push(session);
    activeSessionId.value = session.id;
    return session;
  }

  function selectSession(id: string): void {
    activeSessionId.value = id;
  }

  async function deleteSession(id: string): Promise<void> {
    await sessionPresenter.deleteSession(id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id ?? null;
    }
  }

  return {
    sessions,
    activeSessionId,
    fetchSessions,
    createSession,
    selectSession,
    deleteSession,
  };
});
