<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="tab-tools"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'tools'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'tools')"
      >
        工具
      </button>
      <button
        data-testid="tab-preview"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'preview'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'preview')"
      >
        预览
      </button>
      <button
        data-testid="tab-history"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'history'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'history')"
      >
        历史
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <ToolPanel
        v-if="activeTab === 'tools'"
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
      <ContentDispatcher
        v-else-if="activeTab === 'preview'"
        :content="contentStore.content"
        @interaction-submit="onInteractionSubmit"
        @progress-cancel="onProgressCancel"
      />
      <HistoryPanel v-else-if="activeTab === 'history'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import ToolPanel from "./ToolPanel.vue";
import ContentDispatcher from "./ContentDispatcher.vue";
import HistoryPanel from "./HistoryPanel.vue";
import { useContentStore } from "@/stores/content";
import { usePresenter } from "@/composables/usePresenter";

defineProps<{
  activeTab: "tools" | "preview" | "history";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "update:activeTab": [tab: "tools" | "preview" | "history"];
  "select-tool-call": [id: string | null];
}>();

const contentStore = useContentStore();
const contentPresenter = usePresenter("contentPresenter");
const agentPresenter = usePresenter("agentPresenter");

function onInteractionSubmit(result: { selected?: string | string[]; extra_input?: string }) {
  const content = contentStore.content;
  if (content?.type !== "interaction") return;
  agentPresenter.answerQuestion(content.sessionId, content.toolCallId, JSON.stringify(result));
}

function onProgressCancel() {
  contentPresenter.cancelProgress("current");
}
</script>
