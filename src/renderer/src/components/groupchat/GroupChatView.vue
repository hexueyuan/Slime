<script setup lang="ts">
import { ref, computed } from "vue";
import GroupMessageList from "./GroupMessageList.vue";
import GroupChatInput from "./GroupChatInput.vue";
import { useGroupChatStore } from "@/stores/groupChat";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";

const chatStore = useGroupChatStore();
const sessionStore = useGroupChatSessionStore();

const session = computed(
  () => sessionStore.sessions.find((s) => s.id === sessionStore.activeSessionId) ?? null,
);

const participantAgentIds = computed(() => session.value?.participantAgentIds ?? []);

const isEditingTitle = ref(false);
const titleInput = ref("");

async function onSend(content: string, mentionedAgentIds: string[]) {
  if (!sessionStore.activeSessionId) return;
  await chatStore.sendMessage(sessionStore.activeSessionId, content, mentionedAgentIds);
}

async function onTitleBlur() {
  if (session.value && titleInput.value.trim() && titleInput.value !== session.value.title) {
    await sessionStore.updateTitle(session.value.id, titleInput.value.trim());
  }
  isEditingTitle.value = false;
}

function startEditTitle() {
  titleInput.value = session.value?.title ?? "";
  isEditingTitle.value = true;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Top bar -->
    <div class="flex items-center gap-2 border-b border-border px-4 py-2">
      <div v-if="isEditingTitle" class="flex-1">
        <input
          v-model="titleInput"
          class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
          @blur="onTitleBlur"
          @keydown.enter="onTitleBlur"
          @keydown.escape="isEditingTitle = false"
        />
      </div>
      <div
        v-else
        class="flex-1 cursor-pointer truncate text-sm font-medium text-foreground"
        title="双击编辑标题"
        @dblclick="startEditTitle"
      >
        {{ session?.title ?? "群聊" }}
      </div>
    </div>

    <!-- Messages -->
    <GroupMessageList :messages="chatStore.messages" :typing-agent-ids="chatStore.typingAgentIds" />

    <!-- Input -->
    <GroupChatInput :participant-agent-ids="participantAgentIds" @send="onSend" />
  </div>
</template>
