<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { Icon } from "@iconify/vue";
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
  <div class="relative border-t border-border p-3">
    <!-- @ mention dropdown -->
    <div
      v-if="showMentionDropdown && filteredMentionAgents.length > 0"
      class="absolute bottom-full left-3 right-3 mb-1 rounded-md border border-border bg-neutral-900 py-1 shadow-lg"
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

    <div class="flex items-end gap-2">
      <textarea
        ref="inputRef"
        v-model="inputValue"
        :disabled="disabled"
        placeholder="输入消息，@ 提及 Agent..."
        rows="1"
        class="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
        @input="onInput"
        @keydown="onKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
      <button
        :disabled="disabled || !inputValue.trim()"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
        @click="onSend"
      >
        <Icon icon="lucide:send" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
