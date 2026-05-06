<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="$emit('update:open', false)"
  >
    <div class="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl">
      <h3 class="mb-4 text-sm font-semibold text-foreground">添加时间线条目</h3>

      <div class="mb-3">
        <label class="mb-1 block text-xs text-muted-foreground">内容</label>
        <input
          v-model="content"
          class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          placeholder="做了什么..."
        />
      </div>

      <div class="mb-3 flex gap-3">
        <div class="flex-1">
          <label class="mb-1 block text-xs text-muted-foreground">开始时间</label>
          <input
            v-model="startTime"
            type="time"
            class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-xs text-muted-foreground">结束时间（可选）</label>
          <input
            v-model="endTime"
            type="time"
            class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          @click="$emit('update:open', false)"
        >
          取消
        </button>
        <button
          class="rounded-md bg-violet-500/20 px-3 py-1.5 text-sm text-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
          :disabled="!content.trim() || !startTime"
          @click="submit"
        >
          添加
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ open: boolean; date: string }>();
const emit = defineEmits<{
  "update:open": [v: boolean];
  submit: [entry: { date: string; startTime: string; endTime?: string; content: string }];
}>();

const content = ref("");
const startTime = ref("");
const endTime = ref("");

function submit(): void {
  emit("submit", {
    date: props.date,
    startTime: startTime.value,
    endTime: endTime.value || undefined,
    content: content.value.trim(),
  });
  content.value = "";
  startTime.value = "";
  endTime.value = "";
  emit("update:open", false);
}
</script>
