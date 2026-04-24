<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import WorkspaceSetup from "../components/workspace/WorkspaceSetup.vue";
import { useSplitPane } from "../composables/useSplitPane";
import { usePresenter } from "@/composables/usePresenter";
import { useMessageStore } from "@/stores/chat";
import { useContentStore, setupContentIpc } from "@/stores/content";
import type { AssistantMessageBlock } from "@shared/types/chat";

// Workspace init check
const workspacePresenter = usePresenter("workspacePresenter");
const needsWorkspaceInit = ref<boolean | null>(null);

onMounted(async () => {
  needsWorkspaceInit.value = await workspacePresenter.needsInit();
});

function onWorkspaceReady() {
  needsWorkspaceInit.value = false;
}

const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.65,
  minLeftPx: 280,
  minRightPx: 320,
});

const messageStore = useMessageStore();
const activeTab = ref<"workflow" | "tools" | "preview">("workflow");
const selectedToolCallId = ref<string | null>(null);

const contentStore = useContentStore();
const cleanupContentIpc = setupContentIpc(contentStore);
onUnmounted(cleanupContentIpc);

watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = "preview";
  },
);

const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const blocks =
    messageStore.streamingBlocks.length > 0
      ? messageStore.streamingBlocks
      : getLastAssistantBlocks();
  return blocks.filter((b) => b.type === "tool_call");
});

function getLastAssistantBlocks(): AssistantMessageBlock[] {
  const ids = messageStore.messageIds;
  for (let i = ids.length - 1; i >= 0; i--) {
    const msg = messageStore.getMessage(ids[i]);
    if (msg?.role === "assistant") {
      try {
        return JSON.parse(msg.content);
      } catch {
        return [];
      }
    }
  }
  return [];
}

function onSelectToolCall(id: string | null) {
  if (id) {
    selectedToolCallId.value = id;
    activeTab.value = "tools";
  } else {
    selectedToolCallId.value = null;
  }
}
</script>

<template>
  <!-- Loading -->
  <div
    v-if="needsWorkspaceInit === null"
    class="flex h-full items-center justify-center bg-background"
  >
    <div class="text-muted-foreground">加载中...</div>
  </div>

  <!-- Workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" @ready="onWorkspaceReady" />

  <!-- Evolution center -->
  <div v-else class="flex h-full flex-col bg-sidebar">
    <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
    <div class="flex min-h-0 flex-1">
      <AppSidebar />
      <div
        ref="mainRef"
        class="flex min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
      >
        <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
          <ChatPanel
            :selected-tool-call-id="selectedToolCallId"
            @select-tool-call="onSelectToolCall"
          />
        </div>
        <div
          class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
          @mousedown="onMouseDown"
          @dblclick="resetToDefault"
        >
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div class="min-w-[320px] flex-1 overflow-hidden">
          <FunctionPanel
            :active-tab="activeTab"
            :tool-call-blocks="toolCallBlocks"
            :selected-tool-call-id="selectedToolCallId"
            @update:active-tab="activeTab = $event"
            @select-tool-call="onSelectToolCall"
          />
        </div>
      </div>
    </div>
  </div>
</template>
