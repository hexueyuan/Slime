<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import type { ChatMessageRecord, AgentAvatar as AgentAvatarType } from "@shared/types/agent";
import { useAgentChatStore } from "@/stores/agentChat";
import { formatMessageTime } from "@/utils/formatTime";
import AgentAvatarComp from "./AgentAvatar.vue";

const props = defineProps<{
  message: ChatMessageRecord;
  showTimestamp?: boolean;
}>();

const chatStore = useAgentChatStore();

const userAvatar = computed<AgentAvatarType>(
  () =>
    chatStore.userProfile?.avatar ?? { kind: "monogram", text: "U", backgroundColor: "#3b82f6" },
);
const userName = computed(() => chatStore.userProfile?.name ?? "你");

const copied = ref(false);

async function copyMessage() {
  await navigator.clipboard.writeText(props.message.content);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="group mb-4 flex items-end justify-end gap-2">
    <!-- Bubble column -->
    <div class="flex max-w-[75%] flex-col items-end">
      <!-- Name + time -->
      <div
        v-if="showTimestamp"
        class="mb-1 flex flex-row-reverse items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span>{{ userName }}</span>
        <span>·</span>
        <span>{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <!-- Purple bubble -->
      <div class="rounded-xl bg-violet-600 px-3 py-2 text-sm text-white">
        <div class="whitespace-pre-wrap">{{ message.content }}</div>
      </div>

      <!-- Action bar -->
      <div class="mt-0.5 flex opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="rounded p-1 text-muted-foreground hover:text-foreground"
          @click="copyMessage"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Avatar -->
    <AgentAvatarComp :avatar="userAvatar" size="sm" />
  </div>
</template>
