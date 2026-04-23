<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="tab-workflow"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'workflow'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'workflow')"
      >
        流程
      </button>
      <button
        data-testid="tab-tools"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'tools'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'tools')"
      >
        工具
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <WorkflowPanel v-if="activeTab === 'workflow'" />
      <ToolPanel
        v-else
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import WorkflowPanel from "./WorkflowPanel.vue";
import ToolPanel from "./ToolPanel.vue";

defineProps<{
  activeTab: "workflow" | "tools";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "update:activeTab": [tab: "workflow" | "tools"];
  "select-tool-call": [id: string | null];
}>();
</script>
