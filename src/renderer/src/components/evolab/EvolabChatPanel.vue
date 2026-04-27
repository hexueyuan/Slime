<template>
  <div class="flex flex-col h-full bg-background relative">
    <button
      v-if="messages.length > 0 && !messageStore.isStreaming"
      class="absolute top-2 right-2 z-10 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      @click="onClearMessages"
    >
      清空对话
    </button>
    <MessageList
      ref="messageListRef"
      :messages="messages"
      :streaming-blocks="messageStore.streamingBlocks"
      :current-stream-message-id="messageStore.currentStreamMessageId"
      :is-generating="messageStore.isStreaming"
      :selected-tool-call-id="props.selectedToolCallId"
      @select-tool-call="emit('select-tool-call', $event)"
    />
    <ChatInput
      :is-streaming="messageStore.isStreaming"
      :files="attachedFiles"
      :error="messageStore.streamError"
      :pending-question="messageStore.pendingQuestion"
      @submit="onSubmit"
      @stop="onStop"
      @add-files="onAddFiles"
      @remove-file="onRemoveFile"
      @dismiss-error="messageStore.clearStreamError()"
      @answer-question="onAnswerQuestion"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  selectedToolCallId?: string | null;
}>();

const emit = defineEmits<{
  "select-tool-call": [id: string];
}>();
import { useSessionStore } from "@/stores/session";
import { useMessageStore } from "@/stores/chat";
import { setupMessageIpc } from "@/stores/messageIpc";
import { usePresenter } from "@/composables/usePresenter";
import MessageList from "./MessageList.vue";
import ChatInput from "./EvolabChatInput.vue";
import type { ChatMessageRecord, MessageFile } from "@shared/types/chat";

const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const sessionPresenter = usePresenter("sessionPresenter");
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);
const attachedFiles = ref<MessageFile[]>([]);

// 设置 IPC 监听
const cleanupIpc = setupMessageIpc(messageStore);
onUnmounted(() => {
  cleanupIpc();
});

const messages = computed<ChatMessageRecord[]>(() => {
  return messageStore.messageIds
    .map((id) => messageStore.getMessage(id))
    .filter((m): m is ChatMessageRecord => !!m);
});

// 首次加载：确保有会话并加载消息
onMounted(async () => {
  await sessionStore.ensureSession();
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
  }
});

function onAddFiles(files: File[]) {
  for (const file of files) {
    attachedFiles.value.push({
      id: crypto.randomUUID(),
      name: file.name,
      path: "",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  }
}

function onRemoveFile(id: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.id !== id);
}

async function onSubmit(text: string) {
  if (!sessionStore.activeSessionId) return;
  messageStore.sendMessage(sessionStore.activeSessionId, {
    text,
    files: attachedFiles.value,
  });
  attachedFiles.value = [];
  messageListRef.value?.scrollToBottom(true);
}

async function onStop() {
  if (!sessionStore.activeSessionId) return;
  await messageStore.stopGeneration(sessionStore.activeSessionId);
}

async function onAnswerQuestion(answer: string) {
  if (!sessionStore.activeSessionId) return;
  await messageStore.answerQuestion(sessionStore.activeSessionId, answer);
}

async function onClearMessages() {
  if (!sessionStore.activeSessionId) return;
  await sessionPresenter.clearMessages(sessionStore.activeSessionId);
  messageStore.clearAll();
}
</script>
