<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="chat-tab-tools"
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
        data-testid="chat-tab-preview"
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
        v-if="showDashboard"
        data-testid="chat-tab-dashboard"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'dashboard'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'dashboard')"
      >
        仪表盘
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
      <ThoughtChainPanel
        v-else-if="activeTab === 'preview' && thoughtChainBlocks"
        :blocks="thoughtChainBlocks"
        :selected-tool-call-id="selectedToolCallId"
        @select-tool-call="$emit('select-tool-call', $event)"
      />
      <ContentDispatcher
        v-else-if="activeTab === 'preview'"
        :content="contentStore.content"
        @interaction-submit="onInteractionSubmit"
        @progress-cancel="onProgressCancel"
      />
      <AgentDashboardPanel
        v-else-if="activeTab === 'dashboard' && dashboardTemplate"
        :template="dashboardTemplate"
        :data="dashboardData ?? {}"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import type { AssistantMessageBlock as AgentMessageBlock } from "@shared/types/agent";
import ToolPanel from "@/components/function/ToolPanel.vue";
import ContentDispatcher from "@/components/function/ContentDispatcher.vue";
import ThoughtChainPanel from "@/components/chat/ThoughtChainPanel.vue";
import AgentDashboardPanel from "@/components/chat/AgentDashboardPanel.vue";
import { useContentStore } from "@/stores/content";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";

defineProps<{
  activeTab: "tools" | "preview" | "dashboard";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
  thoughtChainBlocks?: AgentMessageBlock[] | null;
  dashboardTemplate?: string | null;
  dashboardData?: Record<string, unknown>;
  showDashboard?: boolean;
}>();

defineEmits<{
  "update:activeTab": [tab: "tools" | "preview" | "dashboard"];
  "select-tool-call": [id: string | null];
}>();

const contentStore = useContentStore();
const contentPresenter = usePresenter("contentPresenter");
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();

function onInteractionSubmit(result: { selected?: string | string[]; extra_input?: string }) {
  const content = contentStore.content;
  if (content?.type !== "interaction") return;
  const sessionId = sessionStore.activeSessionId;
  if (!sessionId) return;
  chatStore.answerQuestion(sessionId, content.toolCallId, JSON.stringify(result));
}

function onProgressCancel() {
  contentPresenter.cancelProgress("current");
}
</script>
