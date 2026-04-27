<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps<{
  placeholder?: string;
  disabled?: boolean;
  isGenerating?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  stop: [];
}>();

const input = ref("");
const isComposing = ref(false);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    onSend();
  }
}

function onSend() {
  const text = input.value.trim();
  if (!text || props.disabled) return;
  emit("send", text);
  input.value = "";
}
</script>

<template>
  <div class="flex items-end gap-2 border-t border-border px-4 py-3">
    <textarea
      v-model="input"
      :placeholder="placeholder ?? '输入消息...'"
      :disabled="disabled"
      rows="1"
      class="max-h-32 min-h-[36px] flex-1 resize-none rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
      @keydown="onKeydown"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
    />
    <button
      v-if="isGenerating"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30"
      title="停止生成"
      @click="$emit('stop')"
    >
      <Icon icon="lucide:square" class="h-4 w-4" />
    </button>
    <button
      v-else
      :disabled="!input.trim() || disabled"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600"
      title="发送"
      @click="onSend"
    >
      <Icon icon="lucide:arrow-up" class="h-4 w-4" />
    </button>
  </div>
</template>
