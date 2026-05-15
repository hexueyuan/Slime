<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed, ref } from "vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";

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

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const value = date.toISOString().slice(0, 10);
    return {
      date: value,
      label: LABELS[index],
      dayNum: date.getDate(),
      isToday: value === today,
    };
  });
});

const weekNum = computed(() => {
  const date = new Date(weekDays.value[3].date);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - yearStart.getTime()) / 86400000);
  return Math.ceil((days + yearStart.getDay() + 1) / 7);
});

function moveWeek(delta: number): void {
  weekOffset.value += delta;
  if (!weekDays.value.some((day) => day.date === props.selectedDate)) {
    emit("update:selectedDate", weekDays.value[0].date);
  }
}
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-2"
  >
    <div
      class="mr-1 flex items-center gap-2 px-1 text-sm font-semibold text-[var(--color-text-primary)]"
    >
      <Icon icon="lucide:calendar-days" class="h-4 w-4 text-[var(--color-text-muted)]" />
      <span>第{{ weekNum }}周</span>
    </div>

    <SlimeIconButton icon="lucide:chevron-left" title="上一周" size="sm" @click="moveWeek(-1)" />

    <div class="grid min-w-0 flex-1 grid-cols-7 gap-1">
      <button
        v-for="day in weekDays"
        :key="day.date"
        type="button"
        :class="[
          'flex min-w-0 flex-col items-center rounded-[var(--radius-sm)] px-1 py-1.5 text-xs transition-colors',
          day.date === selectedDate
            ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
            : day.isToday
              ? 'text-[var(--color-text-primary)] hover:bg-[var(--color-control-hover)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
        ]"
        @click="$emit('update:selectedDate', day.date)"
      >
        <span class="text-[10px]">{{ day.label }}</span>
        <span class="mt-0.5 font-semibold">{{ day.dayNum }}</span>
      </button>
    </div>

    <SlimeIconButton icon="lucide:chevron-right" title="下一周" size="sm" @click="moveWeek(1)" />
  </div>
</template>
