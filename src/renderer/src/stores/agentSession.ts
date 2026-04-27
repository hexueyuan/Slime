import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { SessionRecord } from "@shared/types/agent";

export const useAgentSessionStore = defineStore("agentSession", () => {
  const chatPresenter = usePresenter("agentChatPresenter");

  const sessions = ref<SessionRecord[]>([]);
  const activeSessionId = ref<string | null>(null);

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeSessionId.value) ?? null,
  );

  const sortedSessions = computed(() =>
    [...sessions.value].sort((a, b) => {
      // Pinned first, then by updatedAt DESC
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    }),
  );

  async function fetchSessions(agentId?: string) {
    sessions.value = (await chatPresenter.getSessions(agentId)) as SessionRecord[];
  }

  function setActiveSession(id: string | null) {
    activeSessionId.value = id;
  }

  async function createSession(agentId: string): Promise<SessionRecord> {
    const session = (await chatPresenter.createSession(agentId)) as SessionRecord;
    await fetchSessions();
    activeSessionId.value = session.id;
    return session;
  }

  async function deleteSession(id: string) {
    await chatPresenter.deleteSession(id);
    if (activeSessionId.value === id) {
      activeSessionId.value = null;
    }
    await fetchSessions();
  }

  async function updateTitle(id: string, title: string) {
    await chatPresenter.updateSessionTitle(id, title);
    await fetchSessions();
  }

  async function togglePin(id: string) {
    await chatPresenter.togglePin(id);
    await fetchSessions();
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    sortedSessions,
    fetchSessions,
    setActiveSession,
    createSession,
    deleteSession,
    updateTitle,
    togglePin,
  };
});
