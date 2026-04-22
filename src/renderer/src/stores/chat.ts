import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export const useChatStore = defineStore("chat", () => {
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);

  const lastMessage = computed(() => messages.value[messages.value.length - 1] ?? null);

  function addMessage(msg: { role: ChatMessage["role"]; content: string }): void {
    messages.value.push({
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
  }

  function clearMessages(): void {
    messages.value = [];
  }

  // TODO: listen to chat:stream-chunk events from main process via window.electron.ipcRenderer.on()

  return {
    messages,
    isLoading,
    lastMessage,
    addMessage,
    clearMessages,
  };
});
