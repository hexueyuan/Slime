<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">时间线</h2>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="添加条目"
        @click="$emit('addEntry')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <div v-if="entries.length === 0" class="flex flex-1 items-center justify-center">
      <p class="text-xs text-muted-foreground">今日暂无记录</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <TimelineEntry v-for="entry in entries" :key="entry.id" :entry="entry" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import TimelineEntry from "./TimelineEntry.vue";
import type { TimelineEntry as TEntry } from "@shared/types/schedule";

defineProps<{ entries: TEntry[] }>();
defineEmits<{ addEntry: [] }>();
</script>
