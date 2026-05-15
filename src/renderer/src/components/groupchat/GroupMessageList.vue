<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
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

const lastUserMsgIndex = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].senderAgentId === null) return i;
  }
  return props.messages.length - 1;
});
</script>

<template>
  <div ref="listRef" class="flex flex-col overflow-y-auto py-2 pb-36" style="height: 100%">
    <GroupMessageItem
      v-for="(msg, index) in messages"
      :key="msg.id"
      :message="msg"
      :typing-agent-ids="index === lastUserMsgIndex ? typingAgentIds : undefined"
    />
    <div
      v-if="messages.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      发送消息开始群聊
    </div>
  </div>
</template>
