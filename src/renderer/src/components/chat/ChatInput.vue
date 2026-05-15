<template>
  <div class="absolute bottom-0 left-0 right-0 z-10 px-6 pb-4">
    <!-- 错误提示 -->
    <div
      v-if="error"
      class="mb-2 flex items-center justify-between rounded-[var(--radius-md)] border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-[var(--color-danger)]"
    >
      <span>{{ error }}</span>
      <div class="ml-2 flex shrink-0 gap-2">
        <SlimeButton variant="ghost" size="sm" @click="$emit('retry')">重试</SlimeButton>
        <SlimeButton variant="ghost" size="sm" @click="$emit('dismiss-error')">关闭</SlimeButton>
      </div>
    </div>
    <!-- 问答卡片 -->
    <div
      v-if="pendingQuestion"
      class="mb-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-accent-brand-soft)] bg-[var(--color-control)] shadow-[var(--shadow-soft)]"
    >
      <div class="px-4 py-3">
        <p class="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
          {{ pendingQuestion.question }}
        </p>
        <!-- 选项按钮 -->
        <div v-if="pendingQuestion.options?.length" class="mb-3 flex flex-wrap gap-2">
          <SlimeButton
            v-for="opt in pendingQuestion.options"
            :key="opt"
            variant="secondary"
            size="sm"
            @click="submitAnswer(opt)"
          >
            {{ opt }}
          </SlimeButton>
        </div>
        <!-- 自定义输入 -->
        <div class="flex gap-2">
          <SlimeInput
            v-model="questionAnswer"
            density="compact"
            placeholder="输入回答..."
            @keydown.enter="submitAnswer(questionAnswer)"
          />
          <SlimeButton
            variant="primary"
            size="sm"
            :disabled="!questionAnswer.trim()"
            @click="submitAnswer(questionAnswer)"
          >
            回答
          </SlimeButton>
        </div>
      </div>
    </div>

    <SlimeComposer
      placeholder="输入消息..."
      :disabled="!!pendingQuestion"
      :is-streaming="isStreaming"
      @submit="$emit('submit', $event)"
      @stop="$emit('stop')"
      @add-files="fileInputRef?.click()"
    >
      <template #attachments>
        <div v-if="files?.length" class="flex flex-wrap gap-1.5 px-4 pt-3">
          <ChatAttachmentItem
            v-for="file in files"
            :key="file.id"
            :file="file"
            @remove="$emit('remove-file', $event)"
          />
        </div>
      </template>
      <template #toolbar>
        <span class="text-[var(--color-text-muted)]">Slime</span>
      </template>
    </SlimeComposer>

    <!-- 隐藏的文件选择器 -->
    <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import ChatAttachmentItem from "./ChatAttachmentItem.vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
import SlimeComposer from "@/components/ui/SlimeComposer.vue";
import SlimeInput from "@/components/ui/SlimeInput.vue";
import type { MessageFile, PendingQuestion } from "@shared/types/chat";

defineProps<{
  isStreaming: boolean;
  files?: MessageFile[];
  error?: string | null;
  pendingQuestion?: PendingQuestion | null;
}>();

const emit = defineEmits<{
  submit: [text: string];
  stop: [];
  "add-files": [files: File[]];
  "remove-file": [id: string];
  "dismiss-error": [];
  retry: [];
  "answer-question": [answer: string];
}>();

const questionAnswer = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    emit("add-files", Array.from(input.files));
    input.value = "";
  }
}

function submitAnswer(answer: string) {
  const text = answer.trim();
  if (!text) return;
  emit("answer-question", text);
  questionAnswer.value = "";
}
</script>
