<template>
  <div data-testid="tool-detail" class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <button
        data-testid="tool-detail-back"
        class="text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('back')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <svg
        v-if="block.status === 'loading'"
        class="h-3.5 w-3.5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <svg
        v-else-if="block.status === 'error'"
        class="h-3.5 w-3.5 text-destructive"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
      <svg
        v-else
        class="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class="text-xs font-medium">{{ toolName }}</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3">
      <ToolDetailExec
        v-if="toolName === 'exec'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailRead
        v-else-if="toolName === 'read'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailEdit
        v-else-if="toolName === 'edit'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailWrite
        v-else-if="toolName === 'write'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailGeneric v-else :params="params" :response="response" :status="block.status" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";
import ToolDetailExec from "./details/ToolDetailExec.vue";
import ToolDetailRead from "./details/ToolDetailRead.vue";
import ToolDetailEdit from "./details/ToolDetailEdit.vue";
import ToolDetailWrite from "./details/ToolDetailWrite.vue";
import ToolDetailGeneric from "./details/ToolDetailGeneric.vue";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

defineEmits<{
  back: [];
}>();

const toolName = computed(() => props.block.tool_call?.name || "unknown");
const params = computed(() => props.block.tool_call?.params || "{}");
const response = computed(() => props.block.tool_call?.response);
</script>
