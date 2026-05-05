<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import NodeRenderer from "markstream-vue";
import { Icon } from "@iconify/vue";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  AgentAvatar as AgentAvatarType,
} from "@shared/types/agent";
import { useAgentChatStore } from "@/stores/agentChat";
import { useAgentStore } from "@/stores/agent";
import { formatMessageTime } from "@/utils/formatTime";
import AgentAvatarComp from "./AgentAvatar.vue";

const props = defineProps<{
  message?: ChatMessageRecord;
  blocks?: AssistantMessageBlock[];
  isStreaming?: boolean;
  agentId?: string;
  showTimestamp?: boolean;
  isLast?: boolean;
  selectedToolCallId?: string | null;
}>();

const emit = defineEmits<{
  "select-tool-call": [id: string];
  "show-thought-chain": [messageId?: string];
}>();

const chatStore = useAgentChatStore();
const agentStore = useAgentStore();

const agentAvatar = computed<AgentAvatarType | null>(
  () => agentStore.agents.find((a) => a.id === props.agentId)?.avatar ?? null,
);
const agentName = computed(
  () => agentStore.agents.find((a) => a.id === props.agentId)?.name ?? "AI",
);

const parsedBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.blocks) return props.blocks;
  if (!props.message) return [];
  try {
    return JSON.parse(props.message.content) as AssistantMessageBlock[];
  } catch {
    return [
      {
        type: "content",
        content: props.message.content,
        status: "success",
        timestamp: props.message.createdAt,
      },
    ];
  }
});

const thinkingBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.isStreaming) return [];
  return parsedBlocks.value.filter((b) => b.type === "thinking");
});

// 携带原始 idx，使 getBlockContent 的 debouncedContents 下标保持一致
const visibleBlocks = computed<{ block: AssistantMessageBlock; originalIdx: number }[]>(() => {
  if (props.isStreaming) return [];
  return parsedBlocks.value
    .filter((b) => b.type !== "thinking")
    .map((block) => ({ block, originalIdx: parsedBlocks.value.indexOf(block) }));
});

const debouncedContents = ref<Map<number, string>>(new Map());

const updateDebounced = useDebounceFn(
  (idx: number, val: string) => {
    debouncedContents.value = new Map(debouncedContents.value).set(idx, val);
  },
  32,
  { maxWait: 64 },
);

watch(
  parsedBlocks,
  (blocks) => {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === "content" && b.content) {
        updateDebounced(i, b.content);
      }
    }
  },
  { immediate: true, deep: true },
);

function getBlockContent(idx: number, block: AssistantMessageBlock): string {
  return debouncedContents.value.get(idx) ?? block.content ?? "";
}

const copied = ref(false);

function copyMessage() {
  const text = parsedBlocks.value
    .filter((b) => b.type === "content" && b.content)
    .map((b) => b.content)
    .join("\n");
  navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function regenerate() {
  if (props.message) {
    chatStore.retryLast(props.message.sessionId);
  }
}
</script>

<template>
  <div class="group mb-4 flex items-start gap-2">
    <!-- Avatar -->
    <AgentAvatarComp :avatar="agentAvatar" size="lg" />

    <!-- Bubble column -->
    <div class="flex max-w-[85%] flex-col items-start">
      <!-- Name + time -->
      <div
        v-if="showTimestamp"
        class="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <span>{{ agentName }}</span>
        <span v-if="message">·</span>
        <span v-if="message">{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <!-- Content blocks -->
      <div class="w-full">
        <!-- Streaming indicator -->
        <template v-if="isStreaming">
          <div class="flex items-center gap-2 py-1">
            <div class="flex gap-1">
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                style="animation-delay: 0ms"
              />
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                style="animation-delay: 150ms"
              />
              <span
                class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
                style="animation-delay: 300ms"
              />
            </div>
            <span class="text-xs text-muted-foreground">思考中...</span>
            <button
              class="ml-1 rounded px-1.5 py-0.5 text-xs text-violet-400 hover:text-violet-300"
              @click="emit('show-thought-chain')"
            >
              查看进度
            </button>
          </div>
        </template>

        <!-- Finished: only visible blocks -->
        <template v-else>
          <!-- Thinking blocks (折叠) -->
          <details
            v-for="(tb, idx) in thinkingBlocks"
            :key="`thinking-${idx}`"
            class="mb-2 rounded-md border border-violet-500/20 bg-violet-500/5"
          >
            <summary
              class="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs text-violet-400 hover:text-violet-300"
            >
              <Icon icon="lucide:brain" class="h-3 w-3" />
              思考过程
            </summary>
            <div
              class="whitespace-pre-wrap px-3 pb-2 pt-1 text-xs leading-relaxed text-muted-foreground"
            >
              {{ tb.thinking }}
            </div>
          </details>

          <template v-for="{ block, originalIdx } in visibleBlocks" :key="originalIdx">
            <!-- Content block -->
            <div
              v-if="block.type === 'content'"
              class="prose prose-xs dark:prose-invert w-full max-w-none"
            >
              <NodeRenderer
                :content="getBlockContent(originalIdx, block)"
                :custom-id="`chat-block-${originalIdx}`"
                :is-dark="true"
              />
            </div>

            <!-- Reasoning block -->
            <details
              v-else-if="block.type === 'reasoning_content'"
              class="mb-2 rounded-md border border-border"
            >
              <summary
                class="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                推理过程
              </summary>
              <div class="whitespace-pre-wrap px-3 pb-2 text-xs text-muted-foreground">
                {{ block.content }}
              </div>
            </details>

            <!-- Error block -->
            <div
              v-else-if="block.type === 'error'"
              class="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
            >
              {{ block.content }}
            </div>

            <!-- Image block -->
            <div v-else-if="block.type === 'image' && block.image_data" class="mb-2">
              <img
                :src="`data:${block.image_data.mimeType};base64,${block.image_data.data}`"
                alt="Generated image"
                class="max-h-80 rounded-md"
              />
            </div>
          </template>
        </template>
      </div>

      <!-- Action bar -->
      <div class="mt-0.5 flex opacity-0 transition-opacity group-hover:opacity-100">
        <button
          class="rounded p-1 text-muted-foreground hover:text-foreground"
          @click="copyMessage"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="!isStreaming && thinkingBlocks.length > 0"
          class="rounded p-1 text-muted-foreground hover:text-foreground"
          title="查看思考链"
          @click="message && emit('show-thought-chain', message.id)"
        >
          <Icon icon="lucide:list-tree" class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="isLast && !isStreaming && !chatStore.isGenerating"
          class="rounded p-1 text-muted-foreground hover:text-foreground"
          @click="regenerate"
        >
          <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
