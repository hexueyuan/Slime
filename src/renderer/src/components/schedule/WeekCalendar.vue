<template>
  <div class="flex items-center gap-2">
    <button
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="prevWeek"
    >
      <Icon icon="lucide:chevron-left" class="h-4 w-4" />
    </button>

    <div class="flex flex-1 justify-between">
      <button
        v-for="day in weekDays"
        :key="day.date"
        :class="[
          'flex w-9 flex-col items-center rounded-md py-1 text-xs',
          day.date === selectedDate
            ? 'bg-violet-500/20 text-violet-400'
            : day.isToday
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-muted/50',
        ]"
        @click="$emit('update:selectedDate', day.date)"
      >
        <span class="text-[10px]">{{ day.label }}</span>
        <span class="mt-0.5 font-medium">{{ day.dayNum }}</span>
      </button>
    </div>

    <button
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="nextWeek"
    >
      <Icon icon="lucide:chevron-right" class="h-4 w-4" />
    </button>
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
