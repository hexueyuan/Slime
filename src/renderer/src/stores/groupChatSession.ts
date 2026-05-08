import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { GroupChatSession } from "@shared/types/groupChat";

export const useGroupChatSessionStore = defineStore("groupChatSession", () => {
  const groupChatPresenter = usePresenter("groupChatPresenter");

  const sessions = ref<GroupChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  /** 只读访问；修改请使用 markDetached/unmarkDetached */
  const detachedSessionIds = ref<Set<string>>(new Set());

  async function fetchSessions() {
    const result = await groupChatPresenter.getSessions();
    sessions.value = (Array.isArray(result) ? result : []) as GroupChatSession[];
  }

  function setActiveSession(id: string | null) {
    activeSessionId.value = id;
  }

  async function createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession> {
    const session = (await groupChatPresenter.createSession(
      participantAgentIds,
      moderatorEnabled,
    )) as GroupChatSession;
    await fetchSessions();
    activeSessionId.value = session.id;
    return session;
  }

  async function deleteSession(id: string) {
    await groupChatPresenter.deleteSession(id);
    if (activeSessionId.value === id) activeSessionId.value = null;
    await fetchSessions();
  }

  async function updateTitle(id: string, title: string) {
    await groupChatPresenter.updateSessionTitle(id, title);
    await fetchSessions();
  }

  function markDetached(sessionId: string) {
    detachedSessionIds.value = new Set([...detachedSessionIds.value, sessionId]);
  }

  function unmarkDetached(sessionId: string) {
    const next = new Set(detachedSessionIds.value);
    next.delete(sessionId);
    detachedSessionIds.value = next;
  }

  function isDetached(sessionId: string): boolean {
    return detachedSessionIds.value.has(sessionId);
  }

  return {
    sessions,
    activeSessionId,
    fetchSessions,
    setActiveSession,
    createSession,
    deleteSession,
    updateTitle,
    markDetached,
    unmarkDetached,
    isDetached,
  };
});
