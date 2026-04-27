import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { ChatMessageRecord, AssistantMessageBlock, UserProfile } from "@shared/types/agent";

export const useAgentChatStore = defineStore("agentChat", () => {
  const chatPresenter = usePresenter("agentChatPresenter");
  const configPresenter = usePresenter("configPresenter");

  const messages = ref<ChatMessageRecord[]>([]);
  const isGenerating = ref(false);
  const streamingMessageId = ref<string | null>(null);
  const streamingBlocks = ref<AssistantMessageBlock[]>([]);
  const error = ref<string | null>(null);
  const userProfile = ref<UserProfile | null>(null);

  async function fetchMessages(sessionId: string) {
    messages.value = (await chatPresenter.getMessages(sessionId)) as ChatMessageRecord[];
    error.value = null;
  }

  async function sendMessage(sessionId: string, content: string) {
    isGenerating.value = true;
    error.value = null;
    try {
      await chatPresenter.chat(sessionId, content);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      isGenerating.value = false;
    }
  }

  function stopGeneration(sessionId: string) {
    chatPresenter.stopGeneration(sessionId);
  }

  async function retryLast(sessionId: string) {
    isGenerating.value = true;
    error.value = null;
    try {
      await chatPresenter.retryLastMessage(sessionId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      isGenerating.value = false;
    }
  }

  function answerQuestion(sessionId: string, toolCallId: string, answer: string) {
    chatPresenter.answerQuestion(sessionId, toolCallId, answer);
  }

  function setStreamingState(messageId: string, blocks: AssistantMessageBlock[]) {
    streamingMessageId.value = messageId;
    streamingBlocks.value = blocks;
  }

  function clearStreamingState() {
    streamingMessageId.value = null;
    streamingBlocks.value = [];
  }

  function setError(err: string) {
    error.value = err;
    isGenerating.value = false;
  }

  function clearMessages() {
    messages.value = [];
    streamingMessageId.value = null;
    streamingBlocks.value = [];
    error.value = null;
    isGenerating.value = false;
  }

  async function fetchUserProfile() {
    const raw = await configPresenter.get("app.userProfile");
    if (raw && typeof raw === "object") {
      userProfile.value = raw as UserProfile;
    } else {
      const userName = (await configPresenter.get("evolution.user")) as string | null;
      const firstChar = userName?.charAt(0) || "U";
      userProfile.value = {
        name: userName || undefined,
        avatar: { kind: "monogram", text: firstChar, backgroundColor: "#3b82f6" },
      };
    }
  }

  async function saveUserProfile(profile: UserProfile) {
    await configPresenter.set("app.userProfile", profile);
    userProfile.value = profile;
  }

  return {
    messages,
    isGenerating,
    streamingMessageId,
    streamingBlocks,
    error,
    userProfile,
    fetchMessages,
    sendMessage,
    stopGeneration,
    retryLast,
    answerQuestion,
    setStreamingState,
    clearStreamingState,
    setError,
    clearMessages,
    fetchUserProfile,
    saveUserProfile,
  };
});
