<template>
  <div class="flex items-center gap-1">
    <button
      class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="prevWeek"
    >
      <Icon icon="lucide:chevron-left" class="h-3 w-3" />
    </button>

    <div class="flex flex-1 items-center justify-between">
      <button
        v-for="day in weekDays"
        :key="day.date"
        :class="[
          'flex w-7 flex-col items-center rounded py-0.5 text-[11px]',
          day.date === selectedDate
            ? 'bg-violet-500/20 text-violet-400'
            : day.isToday
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-muted/50',
        ]"
        @click="$emit('update:selectedDate', day.date)"
      >
        <span class="text-[9px]">{{ day.label }}</span>
        <span class="font-medium">{{ day.dayNum }}</span>
      </button>
    </div>

    <button
      class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="nextWeek"
    >
      <Icon icon="lucide:chevron-right" class="h-3 w-3" />
    </button>

    <span class="ml-1 whitespace-nowrap text-[10px] text-muted-foreground">第{{ weekNum }}周</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps<{ selectedDate: string }>();
const emit = defineEmits<{ "update:selectedDate": [date: string] }>();

const LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const weekOffset = ref(0);
const today = new Date().toISOString().slice(0, 10);

const weekDays = computed(() => {
  const base = new Date(today);
  const dayOfWeek = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - dayOfWeek + 1 + weekOffset.value * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      date,
      label: LABELS[i],
      dayNum: d.getDate(),
      isToday: date === today,
    };
  });
});

const weekNum = computed(() => {
  const d = new Date(weekDays.value[3].date); // Thursday of the week (ISO week rule)
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - yearStart.getTime()) / 86400000);
  return Math.ceil((days + yearStart.getDay() + 1) / 7);
});

function prevWeek(): void {
  weekOffset.value -= 1;
  const idx = weekDays.value.findIndex((d) => d.date === props.selectedDate);
  if (idx < 0) emit("update:selectedDate", weekDays.value[0].date);
}

function nextWeek(): void {
  weekOffset.value += 1;
  const idx = weekDays.value.findIndex((d) => d.date === props.selectedDate);
  if (idx < 0) emit("update:selectedDate", weekDays.value[0].date);
}
</script>
