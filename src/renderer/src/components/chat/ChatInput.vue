<template>
  <div class="sticky bottom-0 z-10 px-6 pb-3">
    <!-- 渐变遮罩 -->
    <div
      class="pointer-events-none absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-background"
    />
    <!-- 输入框容器 -->
    <div
      class="overflow-hidden rounded-xl border border-border bg-card/30 shadow-sm backdrop-blur-lg"
    >
      <!-- 编辑区域 -->
      <div class="px-4 pt-4 pb-2">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="w-full resize-none bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
          :style="{ minHeight: '60px', maxHeight: '240px' }"
          placeholder="输入消息..."
          @keydown="onKeydown"
          @input="autoResize"
        />
      </div>
      <!-- 工具栏 -->
      <div class="flex items-center justify-between px-3 pb-2">
        <!-- 左侧：附件按钮占位 -->
        <button
          class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="附件"
          disabled
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <!-- 右侧：发送/停止按钮 -->
        <button
          v-if="isStreaming"
          data-testid="stop-btn"
          class="flex h-7 w-7 items-center justify-center rounded-full border border-destructive text-destructive hover:bg-destructive/10"
          title="停止生成"
          @click="$emit('stop')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
        <button
          v-else
          data-testid="send-btn"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
          :disabled="!inputText.trim()"
          :class="{ 'opacity-40': !inputText.trim() }"
          title="发送"
          @click="submit"
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

<script setup lang="ts">
import { ref, nextTick } from "vue";

defineProps<{
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  submit: [text: string];
  stop: [];
}>();

const inputText = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isComposing = ref(false);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  const text = inputText.value.trim();
  if (!text) return;
  emit("submit", text);
  inputText.value = "";
  nextTick(() => autoResize());
}

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}
</script>
