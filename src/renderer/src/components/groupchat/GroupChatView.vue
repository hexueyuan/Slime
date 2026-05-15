<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
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
const titleInputRef = ref<HTMLInputElement | null>(null);

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

async function startEditTitle() {
  titleInput.value = session.value?.title ?? "";
  isEditingTitle.value = true;
  await nextTick();
  titleInputRef.value?.focus();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Top bar -->
    <div class="flex items-center gap-2 border-b border-border px-4 py-2">
      <div v-if="isEditingTitle" class="flex-1">
        <input
          ref="titleInputRef"
          v-model="titleInput"
          class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
          @blur="onTitleBlur"
          @keydown.enter="onTitleBlur"
          @keydown.escape="isEditingTitle = false"
        />
      </div>
      <div
        v-else
        class="flex-1 cursor-pointer truncate text-base font-semibold text-foreground"
        title="双击编辑标题"
        @dblclick="startEditTitle"
      >
        {{ session?.title ?? "群聊" }}
      </div>
    </div>

    <!-- Messages + Input -->
    <div class="relative min-h-0 flex-1">
      <GroupMessageList
        :messages="chatStore.messages"
        :typing-agent-ids="chatStore.typingAgentIds"
        class="h-full"
      />
      <GroupChatInput :participant-agent-ids="participantAgentIds" @send="onSend" />
    </div>
  </div>
</template>
