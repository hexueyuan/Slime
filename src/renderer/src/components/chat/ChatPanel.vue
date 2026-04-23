<template>
  <div class="flex flex-col h-full bg-background relative">
    <SessionBar
      :title="currentSessionTitle"
      :sessions="sessionStore.sessions"
      :active-session-id="sessionStore.activeSessionId"
      @new-session="onNewSession"
      @select-session="onSelectSession"
      @delete-session="onDeleteSession"
    />
    <MessageList
      ref="messageListRef"
      :messages="messages"
      :streaming-blocks="messageStore.streamingBlocks"
      :current-stream-message-id="messageStore.currentStreamMessageId"
    />
    <ChatInput
      :is-streaming="messageStore.isStreaming"
      :files="attachedFiles"
      :error="messageStore.streamError"
      @submit="onSubmit"
      @stop="onStop"
      @add-files="onAddFiles"
      @remove-file="onRemoveFile"
      @dismiss-error="messageStore.clearStreamError()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useSessionStore } from "@/stores/session";
import { useMessageStore } from "@/stores/chat";
import { setupMessageIpc } from "@/stores/messageIpc";
import { useWorkflowStore, setupWorkflowIpc } from "@/stores/workflow";
import MessageList from "./MessageList.vue";
import ChatInput from "./ChatInput.vue";
import SessionBar from "./SessionBar.vue";
import type { ChatMessageRecord, MessageFile } from "@shared/types/chat";

const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);
const attachedFiles = ref<MessageFile[]>([]);

// 设置 IPC 监听
const cleanupIpc = setupMessageIpc(messageStore);
const workflowStore = useWorkflowStore();
const cleanupWorkflowIpc = setupWorkflowIpc(workflowStore);
onUnmounted(() => {
  cleanupIpc();
  cleanupWorkflowIpc();
});

const currentSessionTitle = computed(() => {
  const session = sessionStore.sessions.find((s) => s.id === sessionStore.activeSessionId);
  return session?.title || "新对话";
});

const messages = computed<ChatMessageRecord[]>(() => {
  return messageStore.messageIds
    .map((id) => messageStore.getMessage(id))
    .filter((m): m is ChatMessageRecord => !!m);
});

// 首次加载：如果没有活跃会话则创建一个
onMounted(async () => {
  await sessionStore.fetchSessions();
  if (!sessionStore.activeSessionId) {
    if (sessionStore.sessions.length > 0) {
      sessionStore.selectSession(sessionStore.sessions[0].id);
    } else {
      await sessionStore.createSession();
    }
  }
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
  }
});

// 会话切换时加载消息
watch(
  () => sessionStore.activeSessionId,
  async (sessionId) => {
    if (sessionId) {
      await messageStore.loadMessages(sessionId);
      messageListRef.value?.scrollToBottom(true);
    }
  },
);

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
  await messageStore.sendMessage(sessionStore.activeSessionId, {
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

async function onNewSession() {
  await sessionStore.createSession();
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
    messageListRef.value?.scrollToBottom(true);
  }
}

function onSelectSession(id: string) {
  sessionStore.selectSession(id);
}

async function onDeleteSession(id: string) {
  await sessionStore.deleteSession(id);
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
  }
}
</script>
