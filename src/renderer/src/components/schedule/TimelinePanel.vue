<template>
  <div
    class="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
  >
    <div
      class="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3"
    >
      <h2 class="text-sm font-semibold text-[var(--color-text-primary)]">时间线</h2>
      <div class="flex gap-1">
        <SlimeIconButton icon="lucide:locate" title="回到今天" size="sm" @click="scrollToNow" />
        <SlimeIconButton icon="lucide:plus" title="添加条目" size="sm" @click="$emit('addEntry')" />
      </div>
    </div>

    <div v-if="groupedEntries.length === 0" class="flex flex-1 items-center justify-center">
      <p class="text-xs text-[var(--color-text-muted)]">暂无记录</p>
    </div>

    <div v-else ref="scrollContainer" class="flex-1 overflow-y-auto px-4 pb-4" @scroll="onScroll">
      <template v-for="group in groupedEntries" :key="group.date">
        <!-- 日期分隔 -->
        <div
          :ref="
            (el) => {
              if (el) dateRefs[group.date] = el as HTMLElement;
            }
          "
          class="sticky top-0 z-10 mb-1 bg-[var(--color-control)] py-2 backdrop-blur-sm"
        >
          <span
            class="text-[10px] font-medium"
            :class="
              group.isToday
                ? 'text-[var(--color-accent-brand-hover)]'
                : 'text-[var(--color-text-muted)]'
            "
          >
            {{ group.label }}
          </span>
        </div>
        <!-- 该日条目 -->
        <div v-if="group.entries.length > 0" class="mb-3">
          <TimelineEntry v-for="entry in group.entries" :key="entry.id" :entry="entry" />
        </div>
        <div v-else class="mb-3 py-2 text-center text-[10px] text-[var(--color-text-disabled)]">
          无记录
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from "vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import TimelineEntry from "./TimelineEntry.vue";
import type { TimelineEntry as TEntry } from "@shared/types/schedule";

const props = defineProps<{
  entries: TEntry[];
  dates: string[];
}>();
const emit = defineEmits<{ addEntry: []; loadBefore: []; loadAfter: [] }>();

const scrollContainer = ref<HTMLElement | null>(null);
const dateRefs: Record<string, HTMLElement> = {};
const loading = ref(false);
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

const today = new Date().toISOString().slice(0, 10);

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const groupedEntries = computed(() => {
  return props.dates.map((date) => {
    const d = new Date(date);
    const weekday = WEEKDAYS[d.getDay()];
    const isToday = date === today;
    const label = isToday
      ? `今天 ${d.getMonth() + 1}/${d.getDate()} 周${weekday}`
      : `${d.getMonth() + 1}/${d.getDate()} 周${weekday}`;
    const entries = props.entries.filter((e) => e.date === date);
    return { date, label, isToday, entries };
  });
});

function onScroll(): void {
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => checkLoadMore(), 200);
}

async function checkLoadMore(): Promise<void> {
  const el = scrollContainer.value;
  if (!el || loading.value) return;
  loading.value = true;
  try {
    if (el.scrollTop < 50) {
      emit("loadBefore");
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
      emit("loadAfter");
    }
  } finally {
    // 延迟释放锁，避免连续触发
    setTimeout(() => {
      loading.value = false;
    }, 500);
  }
}

function scrollToNow(): void {
  const el = dateRefs[today];
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

onMounted(() => {
  nextTick(() => scrollToNow());
});
</script>
