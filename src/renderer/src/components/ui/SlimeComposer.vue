<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { nextTick, ref } from "vue";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    disabled?: boolean;
    isStreaming?: boolean;
    meta?: string;
  }>(),
  {
    placeholder: "输入消息...",
    disabled: false,
    isStreaming: false,
    meta: "",
  },
);

const emit = defineEmits<{
  submit: [text: string];
  stop: [];
  "add-files": [];
}>();

const inputText = ref("");
const isComposing = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || isComposing.value) return;
  event.preventDefault();
  submit();
}

function submit() {
  const text = inputText.value.trim();
  if (!text || props.disabled) return;
  emit("submit", text);
  inputText.value = "";
  nextTick(() => autoResize());
}
</script>

<template>
  <div
    class="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] shadow-[var(--shadow-floating)]"
  >
    <slot name="attachments" />

    <textarea
      ref="textareaRef"
      v-model="inputText"
      :placeholder="placeholder"
      :disabled="disabled"
      rows="1"
      class="block max-h-[240px] min-h-[96px] w-full resize-none overflow-y-auto bg-transparent px-5 pb-2 pt-5 text-sm leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)]"
      @keydown="onKeydown"
      @input="autoResize"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
    />

    <div class="flex items-center gap-3 px-4 pb-4">
      <button
        type="button"
        class="grid h-[30px] w-[30px] place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)]"
        :disabled="disabled"
        title="添加附件"
        @click="emit('add-files')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>

      <div class="flex min-w-0 flex-1 items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <slot name="toolbar" />
        <span v-if="meta" class="truncate">{{ meta }}</span>
      </div>

      <button
        v-if="isStreaming"
        data-testid="composer-stop"
        type="button"
        class="grid h-[30px] w-[30px] place-items-center rounded-full border border-red-400/30 bg-red-500/10 text-[var(--color-danger)] transition-colors hover:bg-red-500/15"
        title="停止生成"
        @click="emit('stop')"
      >
        <Icon icon="lucide:square" class="h-3.5 w-3.5" />
      </button>
      <button
        v-else
        data-testid="composer-send"
        type="button"
        :disabled="!inputText.trim() || disabled"
        class="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--color-text-primary)] text-[var(--color-primary-foreground)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--color-control-active)] disabled:text-[var(--color-text-disabled)]"
        title="发送"
        @click="submit"
      >
        <Icon icon="lucide:arrow-up" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
