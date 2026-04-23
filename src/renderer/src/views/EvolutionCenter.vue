<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
import { ref } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import { useSplitPane } from "../composables/useSplitPane";

const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
});
</script>

<template>
  <div class="flex h-full flex-row">
    <!-- Sidebar -->
    <AppSidebar />

    <!-- Right content area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Title Bar -->
      <div
        class="flex h-12 shrink-0 items-center border-b border-border bg-sidebar px-4"
        style="-webkit-app-region: drag"
      >
        <span class="text-[15px] font-semibold">进化中心</span>
        <span class="ml-3 text-xs text-muted-foreground">Slime egg v0.1</span>
      </div>

      <!-- Main Content -->
      <div ref="mainRef" class="flex flex-1 overflow-hidden">
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
          <!-- Invisible wider hit area -->
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <!-- Right: Work Area -->
        <div class="min-w-[320px] flex-1 overflow-hidden">
          <FunctionPanel />
        </div>
      </div>
    </div>
  </div>
</template>
