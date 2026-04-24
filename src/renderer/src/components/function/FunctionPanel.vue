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
      <button
        data-testid="tab-preview"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'preview'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'preview')"
      >
        预览
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <WorkflowPanel v-if="activeTab === 'workflow'" />
      <ToolPanel
        v-else-if="activeTab === 'tools'"
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
      <ContentDispatcher
        v-else-if="activeTab === 'preview'"
        :content="contentStore.content"
        @quiz-submit="onQuizSubmit"
        @preview-confirm="onPreviewConfirm"
        @preview-adjust="onPreviewAdjust"
        @progress-cancel="onProgressCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import WorkflowPanel from "./WorkflowPanel.vue";
import ToolPanel from "./ToolPanel.vue";
import ContentDispatcher from "./ContentDispatcher.vue";
import { useContentStore } from "@/stores/content";
import { usePresenter } from "@/composables/usePresenter";

defineProps<{
  activeTab: "workflow" | "tools" | "preview";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "update:activeTab": [tab: "workflow" | "tools" | "preview"];
  "select-tool-call": [id: string | null];
}>();

const contentStore = useContentStore();
const contentPresenter = usePresenter("contentPresenter");

function onQuizSubmit(answers: Record<string, string | string[]>) {
  contentPresenter.submitQuizAnswer("current", answers);
}

function onPreviewConfirm() {
  contentPresenter.confirmPreview("current");
}

function onPreviewAdjust() {
  contentPresenter.adjustPreview("current");
}

function onProgressCancel() {
  contentPresenter.cancelProgress("current");
}
</script>
