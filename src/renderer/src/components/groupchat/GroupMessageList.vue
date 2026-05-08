<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import GroupMessageItem from "./GroupMessageItem.vue";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

const props = defineProps<{
  messages: GroupChatMessageRecord[];
  typingAgentIds: Set<string>;
}>();

const listRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight;
    }
  });
}

watch(() => props.messages.length, scrollToBottom);
watch(() => props.typingAgentIds.size, scrollToBottom);
</script>

<template>
  <div ref="listRef" class="flex flex-1 flex-col overflow-y-auto py-2">
    <GroupMessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
      :typing-agent-ids="msg === messages[messages.length - 1] ? typingAgentIds : undefined"
    />
    <div
      v-if="messages.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      发送消息开始群聊
    </div>
  </div>
</template>
