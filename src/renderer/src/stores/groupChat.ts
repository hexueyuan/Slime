import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import { useGroupChatSessionStore } from "./groupChatSession";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

export const useGroupChatStore = defineStore("groupChat", () => {
  const groupChatPresenter = usePresenter("groupChatPresenter");
  const sessionStore = useGroupChatSessionStore();

  const messages = ref<GroupChatMessageRecord[]>([]);
  /** per-session typing state: sessionId -> Set<agentId> */
  const typingBySession = ref<Map<string, Set<string>>>(new Map());
  const error = ref<string | null>(null);

  const typingAgentIds = computed<Set<string>>(() => {
    const sid = sessionStore.activeSessionId;
    return sid ? (typingBySession.value.get(sid) ?? new Set()) : new Set();
  });

  async function fetchMessages(sessionId: string) {
    const result = await groupChatPresenter.getMessages(sessionId);
    messages.value = (Array.isArray(result) ? result : []) as GroupChatMessageRecord[];
    error.value = null;
  }

  async function sendMessage(sessionId: string, content: string, mentionedAgentIds: string[]) {
    error.value = null;
    try {
      await groupChatPresenter.sendMessage(sessionId, content, mentionedAgentIds);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function stopAgent(sessionId: string, agentId: string) {
    await groupChatPresenter.stopAgent(sessionId, agentId);
  }

  function addMessage(msg: GroupChatMessageRecord) {
    messages.value = [...messages.value, msg];
  }

  function setTyping(sessionId: string, agentId: string, isTyping: boolean) {
    const map = new Map(typingBySession.value);
    const set = new Set(map.get(sessionId) ?? []);
    if (isTyping) set.add(agentId);
    else set.delete(agentId);
    map.set(sessionId, set);
    typingBySession.value = map;
  }

  function clearMessages() {
    messages.value = [];
    error.value = null;
  }

  return {
    messages,
    typingAgentIds,
    error,
    fetchMessages,
    sendMessage,
    stopAgent,
    addMessage,
    setTyping,
    clearMessages,
  };
});
