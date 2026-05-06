<template>
  <div>
    <div class="mb-1 text-xs font-medium text-muted-foreground">随笔</div>
    <div class="flex gap-2">
      <input
        v-model="text"
        class="flex-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
        placeholder="记录一些想法..."
        @keydown.enter="submit"
      />
      <button
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
        :disabled="!text.trim()"
        @click="submit"
      >
        <Icon icon="lucide:send" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";

const emit = defineEmits<{ submit: [content: string] }>();

const text = ref("");

function submit(): void {
  const content = text.value.trim();
  if (!content) return;
  emit("submit", content);
  text.value = "";
}
</script>
