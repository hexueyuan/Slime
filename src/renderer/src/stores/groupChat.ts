import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

export const useGroupChatStore = defineStore("groupChat", () => {
  const groupChatPresenter = usePresenter("groupChatPresenter");

  const messages = ref<GroupChatMessageRecord[]>([]);
  const typingAgentIds = ref<Set<string>>(new Set());
  const error = ref<string | null>(null);

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

  function setTyping(agentId: string, isTyping: boolean) {
    const next = new Set(typingAgentIds.value);
    if (isTyping) next.add(agentId);
    else next.delete(agentId);
    typingAgentIds.value = next;
  }

  function clearMessages() {
    messages.value = [];
    typingAgentIds.value = new Set();
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
