<script setup lang="ts">
import { computed } from "vue";
import { useAgentStore } from "@/stores/agent";
import AgentAvatar from "../chat/AgentAvatar.vue";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { AssistantMessageBlock } from "@shared/types/agent";

const props = defineProps<{
  message: GroupChatMessageRecord;
  typingAgentIds?: Set<string>;
}>();

const agentStore = useAgentStore();

const senderAgent = computed(() => {
  if (!props.message.senderAgentId) return null;
  return agentStore.agents.find((a) => a.id === props.message.senderAgentId) ?? null;
});

const isUser = computed(() => props.message.senderAgentId === null);

// Parse assistant blocks and extract text content for display
const displayContent = computed(() => {
  if (isUser.value) return props.message.content;
  try {
    const blocks = JSON.parse(props.message.content) as AssistantMessageBlock[];
    return blocks
      .filter((b) => b.type === "content" && b.content)
      .map((b) => b.content ?? "")
      .join("");
  } catch {
    return props.message.content;
  }
});

// Typing agents shown under user messages
const typingAgentNames = computed(() => {
  if (!isUser.value || !props.typingAgentIds || props.typingAgentIds.size === 0) return [];
  return [...props.typingAgentIds].map((id) => {
    const agent = agentStore.agents.find((a) => a.id === id);
    return agent?.name ?? id;
  });
});

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <!-- User message -->
  <div v-if="isUser" class="flex flex-col items-end gap-1 px-4 py-2">
    <div class="flex items-end gap-2">
      <div class="max-w-[70%] rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-sm text-white">
        {{ displayContent }}
      </div>
    </div>
    <div class="text-[10px] text-muted-foreground">{{ formatTime(message.createdAt) }}</div>
    <!-- Typing indicator under user message -->
    <div v-if="typingAgentNames.length > 0" class="text-[11px] text-muted-foreground">
      {{ typingAgentNames.join(" · ") }} 正在思考...
    </div>
  </div>

  <!-- Agent message -->
  <div v-else class="flex items-start gap-2 px-4 py-2">
    <AgentAvatar :avatar="senderAgent?.avatar ?? undefined" size="sm" />
    <div class="flex max-w-[70%] flex-col gap-1">
      <div class="text-xs text-muted-foreground">
        {{ senderAgent?.name ?? message.senderAgentId }}
      </div>
      <div class="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-foreground">
        {{ displayContent }}
      </div>
      <div class="text-[10px] text-muted-foreground">{{ formatTime(message.createdAt) }}</div>
    </div>
  </div>
</template>
