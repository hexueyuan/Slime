<template>
  <div class="flex h-full flex-col">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">时间线</h2>
      <div class="flex gap-1">
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          title="回到今天"
          @click="scrollToNow"
        >
          <Icon icon="lucide:locate" class="h-4 w-4" />
        </button>
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          title="添加条目"
          @click="$emit('addEntry')"
        >
          <Icon icon="lucide:plus" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div v-if="groupedEntries.length === 0" class="flex flex-1 items-center justify-center">
      <p class="text-xs text-muted-foreground">暂无记录</p>
    </div>

    <div v-else ref="scrollContainer" class="flex-1 overflow-y-auto" @scroll="onScroll">
      <template v-for="group in groupedEntries" :key="group.date">
        <!-- 日期分隔 -->
        <div
          :ref="
            (el) => {
              if (el) dateRefs[group.date] = el as HTMLElement;
            }
          "
          class="sticky top-0 z-10 mb-1 bg-background/90 py-1 backdrop-blur-sm"
        >
          <span
            class="text-[10px] font-medium"
            :class="group.isToday ? 'text-violet-400' : 'text-muted-foreground'"
          >
            {{ group.label }}
          </span>
        </div>
        <!-- 该日条目 -->
        <div v-if="group.entries.length > 0" class="mb-3">
          <TimelineEntry v-for="entry in group.entries" :key="entry.id" :entry="entry" />
        </div>
        <div v-else class="mb-3 py-2 text-center text-[10px] text-muted-foreground/50">无记录</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from "vue";
import { Icon } from "@iconify/vue";
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
