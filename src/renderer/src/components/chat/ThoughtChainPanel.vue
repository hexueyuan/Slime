<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { AssistantMessageBlock } from "@shared/types/agent";

defineProps<{
  blocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();

const emit = defineEmits<{
  "select-tool-call": [id: string];
}>();
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto p-4">
    <div class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      思考过程
    </div>
    <div class="flex flex-col gap-2">
      <template v-for="(block, idx) in blocks" :key="idx">
        <!-- Thinking step -->
        <details
          v-if="block.type === 'thinking'"
          class="rounded-md border border-violet-500/20 bg-violet-500/5"
        >
          <summary
            class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-violet-400 hover:text-violet-300"
          >
            <span class="min-w-[20px] text-center">{{ idx + 1 }}</span>
            <Icon icon="lucide:brain" class="h-3 w-3 shrink-0" />
            <span>思考过程</span>
            <span v-if="block.status === 'loading'" class="ml-1 text-[10px] text-violet-400/60"
              >思考中...</span
            >
          </summary>
          <div
            class="whitespace-pre-wrap px-3 pb-2 pt-1 text-xs leading-relaxed text-muted-foreground"
          >
            {{ block.thinking || "思考中..." }}
          </div>
        </details>

        <!-- Content step -->
        <div v-else-if="block.type === 'content'" class="flex items-start gap-3">
          <span class="mt-0.5 min-w-[20px] text-center text-xs text-muted-foreground">
            {{ idx + 1 }}
          </span>
          <p class="text-xs leading-relaxed text-muted-foreground">{{ block.content }}</p>
        </div>

        <!-- Tool call step -->
        <div
          v-else-if="block.type === 'tool_call' && block.tool_call"
          :data-testid="`tool-step-${block.id}`"
          class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-muted/30"
          :class="
            selectedToolCallId && block.id && selectedToolCallId === block.id
              ? 'border-violet-500/60 bg-violet-500/10'
              : 'border-border'
          "
          @click="block.id && emit('select-tool-call', block.id)"
        >
          <span class="min-w-[20px] text-center text-xs text-violet-400">{{ idx + 1 }}</span>
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
        </div>

        <!-- Error step -->
        <div v-else-if="block.type === 'error'" class="flex items-start gap-3">
          <span class="mt-0.5 min-w-[20px] text-center text-xs text-red-400">{{ idx + 1 }}</span>
          <p class="text-xs text-red-400">{{ block.content }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
