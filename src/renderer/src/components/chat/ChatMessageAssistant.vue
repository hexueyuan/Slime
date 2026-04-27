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

function formatToolInput(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input.slice(0, 100);
  try {
    const str = JSON.stringify(input);
    return str.length > 100 ? str.slice(0, 100) + "..." : str;
  } catch {
    return "";
  }
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
    <AgentAvatarComp :avatar="agentAvatar" size="sm" />

    <!-- Bubble column -->
    <div class="flex max-w-[85%] flex-col items-start">
      <!-- Name + time -->
      <div
        v-if="showTimestamp"
        class="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span>{{ agentName }}</span>
        <span v-if="message">·</span>
        <span v-if="message">{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <!-- Content blocks -->
      <div class="w-full">
        <template v-for="(block, idx) in parsedBlocks" :key="idx">
          <!-- Content block -->
          <div
            v-if="block.type === 'content'"
            class="prose prose-xs dark:prose-invert w-full max-w-none"
          >
            <NodeRenderer
              :content="getBlockContent(idx, block)"
              :custom-id="`chat-block-${idx}`"
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

          <!-- Tool call block -->
          <div
            v-else-if="block.type === 'tool_call' && block.tool_call"
            class="mb-2 w-full max-w-3xl"
          >
            <div
              class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
            >
              <svg
                v-if="block.status === 'loading'"
                class="h-3.5 w-3.5 shrink-0 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <Icon
                v-else-if="block.status === 'error'"
                icon="lucide:x"
                class="h-3.5 w-3.5 shrink-0 text-red-400"
              />
              <Icon v-else icon="lucide:check" class="h-3.5 w-3.5 shrink-0 text-green-500" />
              <span class="font-medium text-foreground">{{ block.tool_call.name }}</span>
              <span class="truncate">{{ formatToolInput(block.tool_call.input) }}</span>
            </div>
          </div>

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
