<template>
  <div class="flex h-full flex-col bg-[var(--color-app-canvas)]">
    <div
      class="flex h-[54px] shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-5"
    >
      <div class="flex items-center gap-2">
        <button
          data-testid="chat-tab-tools"
          type="button"
          :class="[
            'inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-sm font-semibold transition-colors',
            activeTab === 'tools'
              ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          ]"
          @click="$emit('update:activeTab', 'tools')"
        >
          <Icon icon="lucide:square-plus" class="h-4 w-4 text-[var(--color-text-muted)]" />
          审查
        </button>
        <button
          data-testid="chat-tab-preview"
          type="button"
          :class="[
            'inline-flex h-8 items-center rounded-[var(--radius-md)] px-2.5 text-sm font-semibold transition-colors',
            activeTab === 'preview'
              ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          ]"
          @click="$emit('update:activeTab', 'preview')"
        >
          预览
        </button>
        <SlimeIconButton icon="lucide:plus" title="新增检查" size="sm" />
      </div>

      <div class="flex items-center gap-1">
        <SlimeIconButton icon="lucide:maximize-2" title="放大" size="sm" />
        <SlimeIconButton icon="lucide:panel-right" title="收起面板" size="sm" />
      </div>
    </div>

    <div
      class="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-5"
    >
      <button
        type="button"
        class="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]"
      >
        <span class="truncate">上轮对话</span>
        <Icon icon="lucide:chevron-down" class="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
      </button>

      <div class="flex items-center gap-1">
        <SlimeIconButton icon="lucide:more-horizontal" title="更多" size="sm" />
        <SlimeIconButton icon="lucide:file-search" title="搜索文件" size="sm" />
        <SlimeIconButton icon="lucide:folder-open" title="打开文件夹" size="sm" />
        <SlimeIconButton icon="lucide:git-branch" title="变更" size="sm" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <ToolPanel
        v-if="activeTab === 'tools' && toolCallBlocks.length > 0"
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
        v-else-if="activeTab === 'preview' && contentStore.content"
        :content="contentStore.content"
        @interaction-submit="onInteractionSubmit"
        @progress-cancel="onProgressCancel"
      />
      <div v-else class="flex h-full items-center justify-center px-8 text-center">
        <div class="max-w-[220px]">
          <div
            class="mx-auto mb-5 grid h-16 w-16 rotate-6 place-items-center rounded-[14px] border border-[var(--color-border-strong)] bg-[var(--color-control)] text-[var(--color-text-muted)]"
          >
            <Icon icon="lucide:file-diff" class="h-8 w-8" />
          </div>
          <div class="text-sm font-semibold text-[var(--color-text-primary)]">
            {{ activeTab === "tools" ? "暂无工具调用" : "暂无预览内容" }}
          </div>
          <p class="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {{
              activeTab === "tools"
                ? "运行工具后，调用记录会显示在这里。"
                : "生成预览或交互内容后会显示在这里。"
            }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { AssistantMessageBlock } from "@shared/types/chat";
import type { AssistantMessageBlock as AgentMessageBlock } from "@shared/types/agent";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import ToolPanel from "@/components/function/ToolPanel.vue";
import ContentDispatcher from "@/components/function/ContentDispatcher.vue";
import ThoughtChainPanel from "@/components/chat/ThoughtChainPanel.vue";
import { useContentStore } from "@/stores/content";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";

defineProps<{
  activeTab: "tools" | "preview";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
  thoughtChainBlocks?: AgentMessageBlock[] | null;
}>();

defineEmits<{
  "update:activeTab": [tab: "tools" | "preview"];
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
