<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
import { ref } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import { useSplitPane } from "../composables/useSplitPane";

const mainRef = ref<HTMLElement | null>(null);
const activeTab = ref<"workflow" | "tools">("workflow");
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
});
</script>

<template>
  <div class="flex h-full flex-col bg-sidebar">
    <!-- Title Bar (full width, above everything) -->
    <div class="h-9 shrink-0" style="-webkit-app-region: drag" />

    <!-- Body: Sidebar + Content card -->
    <div class="flex min-h-0 flex-1">
      <!-- Sidebar (below title bar, no overlap with traffic lights) -->
      <AppSidebar />

      <!-- Content area as a "card" with rounded top-left corner -->
      <div
        ref="mainRef"
        class="flex min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
      >
        <!-- Left: Chat Panel -->
        <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
          <ChatPanel />
        </div>

        <!-- Draggable Divider: 1px visual, wider hit area -->
        <div
          class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
          @mousedown="onMouseDown"
          @dblclick="resetToDefault"
        >
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <!-- Right: Work Area -->
        <div class="min-w-[320px] flex-1 overflow-hidden">
          <FunctionPanel v-model:active-tab="activeTab" :tool-call-blocks="[]" />
        </div>
      </div>
    </div>
  </div>
</template>
