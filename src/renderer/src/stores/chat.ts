import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  UserMessageContent,
  PendingQuestion,
} from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useMessageStore = defineStore("message", () => {
  const messageIds = ref<string[]>([]);
  const messageCache = ref<Map<string, ChatMessageRecord>>(new Map());
  const isStreaming = ref(false);
  const streamingBlocks = ref<AssistantMessageBlock[]>([]);
  const currentStreamMessageId = ref<string | null>(null);
  const currentStreamSessionId = ref<string | null>(null);
  const streamError = ref<string | null>(null);
  const pendingQuestion = ref<PendingQuestion | null>(null);

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

  function setStreamError(error: string): void {
    streamError.value = error;
  }

  function clearStreamError(): void {
    streamError.value = null;
  }

  function setPendingQuestion(q: PendingQuestion | null): void {
    pendingQuestion.value = q;
  }

  function clearPendingQuestion(): void {
    pendingQuestion.value = null;
  }

  async function answerQuestion(sessionId: string, answer: string): Promise<void> {
    if (!pendingQuestion.value) return;
    const { toolCallId } = pendingQuestion.value;
    clearPendingQuestion();
    await agentPresenter.answerQuestion(sessionId, toolCallId, answer);
  }

  function sendMessage(sessionId: string, content: UserMessageContent): void {
    addOptimisticUserMessage(sessionId, content);
    clearStreamError();
    setStreamingState(sessionId, `pending-${Date.now()}`, []);
    agentPresenter.chat(sessionId, content).catch((err: unknown) => {
      clearStreamingState();
      setStreamError(String(err));
    });
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
    streamError,
    pendingQuestion,
    getMessage,
    loadMessages,
    addOptimisticUserMessage,
    setStreamingState,
    clearStreamingState,
    setStreamError,
    clearStreamError,
    setPendingQuestion,
    clearPendingQuestion,
    answerQuestion,
    sendMessage,
    stopGeneration,
  };
});
