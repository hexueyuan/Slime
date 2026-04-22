import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  UserMessageContent,
} from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useMessageStore = defineStore("message", () => {
  const messageIds = ref<string[]>([]);
  const messageCache = ref<Map<string, ChatMessageRecord>>(new Map());
  const isStreaming = ref(false);
  const streamingBlocks = ref<AssistantMessageBlock[]>([]);
  const currentStreamMessageId = ref<string | null>(null);
  const currentStreamSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");
  const agentPresenter = usePresenter("agentPresenter");

  function getMessage(id: string): ChatMessageRecord | undefined {
    return messageCache.value.get(id);
  }

  async function loadMessages(sessionId: string): Promise<void> {
    const messages = (await sessionPresenter.getMessages(sessionId)) as ChatMessageRecord[];
    messageIds.value = messages.map((m) => m.id);
    messageCache.value = new Map(messages.map((m) => [m.id, m]));
  }

  function addOptimisticUserMessage(sessionId: string, content: UserMessageContent): string {
    const id = crypto.randomUUID();
    const message: ChatMessageRecord = {
      id,
      sessionId,
      role: "user",
      content: JSON.stringify(content),
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    messageIds.value.push(id);
    messageCache.value.set(id, message);
    return id;
  }

  function setStreamingState(
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
  ): void {
    isStreaming.value = true;
    currentStreamSessionId.value = sessionId;
    currentStreamMessageId.value = messageId;
    streamingBlocks.value = blocks;
  }

  function clearStreamingState(): void {
    isStreaming.value = false;
    currentStreamSessionId.value = null;
    currentStreamMessageId.value = null;
    streamingBlocks.value = [];
  }

  async function sendMessage(sessionId: string, content: UserMessageContent): Promise<void> {
    addOptimisticUserMessage(sessionId, content);
    await agentPresenter.chat(sessionId, content);
  }

  async function stopGeneration(sessionId: string): Promise<void> {
    await agentPresenter.stopGeneration(sessionId);
  }

  return {
    messageIds,
    messageCache,
    isStreaming,
    streamingBlocks,
    currentStreamMessageId,
    currentStreamSessionId,
    getMessage,
    loadMessages,
    addOptimisticUserMessage,
    setStreamingState,
    clearStreamingState,
    sendMessage,
    stopGeneration,
  };
});
