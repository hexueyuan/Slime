<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed, ref } from "vue";
import SlimeBadge from "@/components/ui/SlimeBadge.vue";

const props = withDefaults(
  defineProps<{
    selectedDate: string;
    title?: string;
    badge?: string;
    showHeader?: boolean;
  }>(),
  {
    title: "任务管理",
    badge: "Schedule Kit",
    showHeader: true,
  },
);
const emit = defineEmits<{ "update:selectedDate": [date: string] }>();

const LABELS = ["周一", "周二", "今天", "周四", "周五", "周六", "周日"];
const weekOffset = ref(0);

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = toLocalDateString(new Date());

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
      label: value === today ? "今天" : LABELS[index],
      dayNum: date.getDate(),
      isToday: value === today,
      dots: index === 0 ? 1 : index === 1 ? 2 : index === 2 ? 3 : index === 3 ? 1 : 0,
    };
  });
});

function moveWeek(delta: number): void {
  weekOffset.value += delta;
  if (!weekDays.value.some((day) => day.date === props.selectedDate)) {
    emit("update:selectedDate", weekDays.value[0].date);
  }
}
</script>

<template>
  <section
    data-component-id="SlimeWeekCalendar"
    data-layout="adaptive"
    class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3 sm:p-4"
  >
    <div v-if="showHeader" class="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h2 class="min-w-0 text-lg font-semibold text-[var(--color-text-primary)]">{{ title }}</h2>
      <SlimeBadge variant="accent">{{ badge }}</SlimeBadge>
    </div>

    <div class="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
      <button
        type="button"
        title="上一周"
        class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[var(--color-border-subtle)] bg-white/[0.03] text-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
        @click="moveWeek(-1)"
      >
        <Icon icon="lucide:chevron-left" class="h-4 w-4" />
      </button>

      <div
        data-testid="week-day-grid"
        data-layout="responsive-compact-grid"
        data-overflow-x="none"
        class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2"
      >
        <button
          v-for="day in weekDays"
          :key="day.date"
          type="button"
          :data-testid="`week-day-${day.date}`"
          :class="[
            'min-h-[58px] min-w-0 rounded-[10px] border px-2 py-1.5 text-left transition-colors sm:min-h-[72px]',
            day.date === selectedDate
              ? 'border-[color-mix(in_srgb,var(--color-accent-brand)_38%,transparent)] bg-[var(--color-accent-brand-soft)]'
              : 'border-[var(--color-border-subtle)] bg-white/[0.026] hover:bg-[var(--color-control-hover)]',
          ]"
          @click="$emit('update:selectedDate', day.date)"
        >
          <span class="block text-[10px] font-medium text-[var(--color-text-muted)]">{{
            day.label
          }}</span>
          <span class="mt-1.5 block text-[17px] font-semibold text-[var(--color-text-primary)]">{{
            day.dayNum
          }}</span>
          <span v-if="day.dots > 0" class="mt-1.5 flex gap-[3px]">
            <span
              v-for="dot in day.dots"
              :key="dot"
              :class="[
                'h-[5px] w-[5px] rounded-full',
                day.date === selectedDate && dot === 1
                  ? 'bg-[var(--color-accent-brand)]'
                  : 'bg-white/[0.22]',
              ]"
            />
          </span>
        </button>
      </div>

      <button
        type="button"
        title="下一周"
        class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-[var(--color-border-subtle)] bg-white/[0.03] text-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
        @click="moveWeek(1)"
      >
        <Icon icon="lucide:chevron-right" class="h-4 w-4" />
      </button>
    </div>
  </section>
</template>
