<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useAgentStore } from "@/stores/agent";
import type { Agent } from "@shared/types/agent";

const props = defineProps<{
  participantAgentIds: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string, mentionedAgentIds: string[]];
}>();

const agentStore = useAgentStore();
const inputRef = ref<HTMLTextAreaElement | null>(null);
const inputValue = ref("");
const showMentionDropdown = ref(false);
const mentionQuery = ref("");
const mentionStartIndex = ref(-1);
const isComposing = ref(false);

const participantAgents = computed(
  () =>
    props.participantAgentIds
      .map((id) => agentStore.agents.find((a) => a.id === id))
      .filter(Boolean) as Agent[],
);

const filteredMentionAgents = computed(() =>
  mentionQuery.value
    ? participantAgents.value.filter((a) =>
        a.name.toLowerCase().includes(mentionQuery.value.toLowerCase()),
      )
    : participantAgents.value,
);

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  autoResize();
  const cursorPos = el.selectionStart ?? 0;
  const textBefore = inputValue.value.slice(0, cursorPos);
  const atIndex = textBefore.lastIndexOf("@");

  if (atIndex !== -1 && (atIndex === 0 || textBefore[atIndex - 1] === " ")) {
    const query = textBefore.slice(atIndex + 1);
    if (!query.includes(" ")) {
      mentionQuery.value = query;
      mentionStartIndex.value = atIndex;
      showMentionDropdown.value = true;
      return;
    }
  }
  showMentionDropdown.value = false;
}

function selectMention(agent: Agent) {
  if (mentionStartIndex.value === -1) return;
  const before = inputValue.value.slice(0, mentionStartIndex.value);
  const after = inputValue.value.slice(mentionStartIndex.value + 1 + mentionQuery.value.length);
  inputValue.value = `${before}@${agent.name} ${after}`;
  showMentionDropdown.value = false;
  mentionStartIndex.value = -1;
  nextTick(() => {
    inputRef.value?.focus();
    autoResize();
  });
}

// 解析两种格式：
// 1. 通过下拉选择插入的 "@AgentName " (末尾空格，\S+ 自然截断)
// 2. 手动输入的 "@AgentName," (末尾逗号，replace 去除)
function parseMentions(text: string): string[] {
  const regex = /@(\S+)/g;
  const agentIds: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].replace(/,$/, "");
    const agent = participantAgents.value.find((a) => a.name === name);
    if (agent) agentIds.push(agent.id);
  }
  return [...new Set(agentIds)];
}

function onSend() {
  const content = inputValue.value.trim();
  if (!content) return;
  const mentionedAgentIds = parseMentions(content);
  emit("send", content, mentionedAgentIds);
  inputValue.value = "";
  showMentionDropdown.value = false;
  nextTick(() => autoResize());
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    onSend();
  }
  if (e.key === "Escape") showMentionDropdown.value = false;
}

function autoResize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 128) + "px";
}
</script>

<template>
  <div class="absolute bottom-0 left-0 right-0 z-10 px-6 pb-3">
    <!-- @ mention dropdown -->
    <div
      v-if="showMentionDropdown && filteredMentionAgents.length > 0"
      class="mb-1 overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm backdrop-blur-lg"
    >
      <button
        v-for="agent in filteredMentionAgents"
        :key="agent.id"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        @mousedown.prevent="selectMention(agent)"
      >
        <span class="font-medium">{{ agent.name }}</span>
        <span v-if="agent.description" class="truncate text-xs text-muted-foreground">
          {{ agent.description }}
        </span>
      </button>
    </div>

    <!-- 输入框容器 -->
    <div
      class="overflow-hidden rounded-xl border border-border bg-card/30 shadow-sm backdrop-blur-lg"
    >
      <!-- 编辑区域 -->
      <div class="px-4 pt-4 pb-2">
        <textarea
          ref="inputRef"
          v-model="inputValue"
          :disabled="disabled"
          class="w-full resize-none bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none overflow-y-auto"
          :style="{ minHeight: '60px', maxHeight: '240px' }"
          placeholder="输入消息，@ 提及 Agent..."
          @input="onInput"
          @keydown="onKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
      </div>
      <!-- 工具栏 -->
      <div class="flex items-center justify-end px-3 pb-2">
        <button
          :disabled="disabled || !inputValue.trim()"
          :class="{ 'opacity-40': disabled || !inputValue.trim() }"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
          title="发送"
          @click="onSend"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
