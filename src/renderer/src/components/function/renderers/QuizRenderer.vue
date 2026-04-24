<template>
  <div class="flex flex-col gap-4 p-4">
    <h3 class="text-sm font-semibold text-foreground">请确认以下细节：</h3>

    <div v-for="question in content.questions" :key="question.id" class="flex flex-col gap-2">
      <p class="text-sm font-medium text-foreground">{{ question.text }}</p>

      <div class="flex flex-col gap-1.5 pl-1">
        <label
          v-for="option in question.options"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
          :class="
            isSelected(question.id, option.value)
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/50'
          "
        >
          <input
            :type="question.multiple ? 'checkbox' : 'radio'"
            :name="question.id"
            :value="option.value"
            :checked="isSelected(question.id, option.value)"
            class="accent-primary"
            @change="selectOption(question.id, option.value, question.multiple)"
          />
          <span class="flex items-center gap-1.5">
            {{ option.label }}
            <span
              v-if="option.recommended"
              class="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
            >
              推荐
            </span>
          </span>
        </label>

        <input
          v-if="question.allowCustom"
          data-testid="quiz-custom-input"
          type="text"
          class="rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:border-solid"
          placeholder="或自定义..."
          :value="customInputs[question.id] || ''"
          @input="handleCustomInput(question.id, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <button
      data-testid="quiz-submit"
      class="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="!canSubmit"
      @click="handleSubmit"
    >
      确认
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue";
import type { QuizContent } from "@shared/types/content";

const props = defineProps<{ content: QuizContent }>();
const emit = defineEmits<{ submit: [answers: Record<string, string | string[]>] }>();

const answers = reactive<Record<string, string | string[]>>({});
const customInputs = reactive<Record<string, string>>({});

function selectOption(questionId: string, value: string, multiple?: boolean) {
  if (multiple) {
    const current = (answers[questionId] as string[]) || [];
    if (current.includes(value)) {
      answers[questionId] = current.filter((v) => v !== value);
    } else {
      answers[questionId] = [...current, value];
    }
  } else {
    answers[questionId] = value;
    customInputs[questionId] = "";
  }
}

function isSelected(questionId: string, value: string): boolean {
  const answer = answers[questionId];
  if (Array.isArray(answer)) return answer.includes(value);
  return answer === value;
}

function handleCustomInput(questionId: string, value: string) {
  customInputs[questionId] = value;
  answers[questionId] = value;
}

const canSubmit = computed(() =>
  props.content.questions.every((q) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === "") return false;
    return Array.isArray(answer) ? answer.length > 0 : true;
  }),
);

function handleSubmit() {
  if (!canSubmit.value) return;
  emit("submit", { ...answers });
}
</script>
