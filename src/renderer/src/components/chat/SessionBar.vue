<template>
  <div
    class="absolute top-0 left-0 right-0 z-10 flex h-10 items-center justify-between bg-background/50 px-4 backdrop-blur-lg"
  >
    <button
      data-testid="session-title"
      class="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      @click="dropdownOpen = !dropdownOpen"
    >
      <span class="truncate max-w-[200px]">{{ title || "新对话" }}</span>
      <svg
        class="h-3.5 w-3.5 text-muted-foreground transition-transform"
        :class="{ 'rotate-180': dropdownOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <button
      data-testid="new-session-btn"
      class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="新建会话"
      @click="$emit('new-session')"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <div
      v-if="dropdownOpen"
      data-testid="session-dropdown"
      class="absolute left-2 right-2 top-10 z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
    >
      <div
        v-for="session in sessions"
        :key="session.id"
        class="group flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-muted transition-colors"
        :class="{
          'bg-muted/50 text-foreground': session.id === activeSessionId,
          'text-muted-foreground': session.id !== activeSessionId,
        }"
        @click="onSelectSession(session.id)"
      >
        <span class="truncate">{{ session.title || "新对话" }}</span>
        <button
          class="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
          title="删除"
          @click.stop="$emit('delete-session', session.id)"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div v-if="!sessions?.length" class="px-3 py-4 text-center text-xs text-muted-foreground">
        暂无会话
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ChatSession } from "@shared/types/chat";

defineProps<{
  title?: string;
  sessionCount?: number;
  sessions?: ChatSession[];
  activeSessionId?: string | null;
}>();

const emit = defineEmits<{
  "new-session": [];
  "select-session": [id: string];
  "delete-session": [id: string];
}>();

const dropdownOpen = ref(false);

function onSelectSession(id: string) {
  emit("select-session", id);
  dropdownOpen.value = false;
}
</script>
