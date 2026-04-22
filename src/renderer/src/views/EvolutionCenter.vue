<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
import { ref } from "vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import { useSplitPane } from "../composables/useSplitPane";

const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, isDragging, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Title Bar -->
    <div
      class="flex h-12 shrink-0 items-center border-b border-border px-4"
      style="-webkit-app-region: drag"
    >
      <div class="w-[70px] shrink-0" />
      <span class="text-[15px] font-semibold">进化中心</span>
      <span class="ml-3 text-xs text-muted-foreground">Slime egg v0.1</span>
    </div>

    <!-- Main Content -->
    <div ref="mainRef" class="flex flex-1 overflow-hidden">
      <!-- Left: Chat Panel -->
      <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
        <ChatPanel />
      </div>

      <!-- Draggable Divider -->
      <div
        class="flex w-[5px] shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-border"
        :class="{ 'bg-border': isDragging }"
        @mousedown="onMouseDown"
        @dblclick="resetToDefault"
      >
        <div class="h-10 w-px rounded-full bg-border" />
      </div>

      <!-- Right: Function Panel -->
      <div class="min-w-[320px] flex-1 overflow-hidden">
        <FunctionPanel />
      </div>
    </div>
  </div>
</template>
