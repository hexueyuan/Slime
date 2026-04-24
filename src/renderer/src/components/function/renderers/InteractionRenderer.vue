<script setup lang="ts">
import { ref, computed } from "vue";
import type { InteractionContent } from "@shared/types/content";

const props = defineProps<{ content: InteractionContent }>();
const emit = defineEmits<{
  submit: [result: { selected?: string | string[]; extra_input?: string }];
}>();

const selected = ref<Set<string>>(new Set());
const extraInput = ref("");

function toggle(value: string) {
  if (props.content.multiple) {
    if (selected.value.has(value)) selected.value.delete(value);
    else selected.value.add(value);
  } else {
    selected.value = new Set([value]);
  }
}

const canSubmit = computed(() => selected.value.size > 0 || extraInput.value.trim().length > 0);

function submit() {
  if (!canSubmit.value) return;
  const result: { selected?: string | string[]; extra_input?: string } = {};
  if (selected.value.size > 0) {
    result.selected = props.content.multiple ? [...selected.value] : [...selected.value][0];
  }
  if (extraInput.value.trim()) result.extra_input = extraInput.value.trim();
  emit("submit", result);
}
</script>

<template>
  <div class="interaction-renderer">
    <div v-if="content.htmlContent" class="interaction-renderer__preview">
      <iframe
        sandbox="allow-scripts"
        :srcdoc="content.htmlContent"
        class="interaction-renderer__iframe"
      />
    </div>

    <div class="interaction-renderer__question">{{ content.question }}</div>

    <div class="interaction-renderer__options">
      <button
        v-for="opt in content.options"
        :key="opt.value"
        class="interaction-renderer__option"
        :class="{
          'interaction-renderer__option--selected': selected.has(opt.value),
          'interaction-renderer__option--recommended': opt.recommended,
        }"
        @click="toggle(opt.value)"
      >
        <span class="interaction-renderer__radio">
          {{
            selected.has(opt.value) ? (content.multiple ? "☑" : "●") : content.multiple ? "☐" : "○"
          }}
        </span>
        <span>{{ opt.label }}</span>
        <span v-if="opt.recommended" class="interaction-renderer__badge">推荐</span>
      </button>
    </div>

    <textarea
      v-model="extraInput"
      class="interaction-renderer__extra"
      placeholder="补充说明（可选）..."
      rows="2"
    />

    <button class="interaction-renderer__submit" :disabled="!canSubmit" @click="submit">
      确认
    </button>
  </div>
</template>

<style scoped>
.interaction-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.interaction-renderer__preview {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.interaction-renderer__iframe {
  width: 100%;
  height: 300px;
  border: none;
  background: #fff;
}

.interaction-renderer__question {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-foreground);
}

.interaction-renderer__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.interaction-renderer__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-foreground);
  text-align: left;
  transition: all 0.15s;
}

.interaction-renderer__option:hover {
  border-color: var(--color-primary);
}

.interaction-renderer__option--selected {
  border-color: var(--color-primary);
  background: rgba(139, 92, 246, 0.15);
}

.interaction-renderer__radio {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.interaction-renderer__badge {
  font-size: 11px;
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: auto;
}

.interaction-renderer__extra {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-foreground);
  font-size: 13px;
  resize: vertical;
}

.interaction-renderer__extra::placeholder {
  color: var(--color-muted-foreground);
}

.interaction-renderer__submit {
  padding: 10px;
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.interaction-renderer__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.interaction-renderer__submit:not(:disabled):hover {
  opacity: 0.9;
}
</style>
