<script setup lang="ts">
import { computed } from "vue";
import SlimeBadge from "@/components/ui/SlimeBadge.vue";
import SlimePanel from "@/components/ui/SlimePanel.vue";

type BadgeItem = {
  label: string;
  variant?: "neutral" | "accent" | "success" | "warning" | "danger";
};

type StatItem = {
  label: string;
  value: string | number;
};

const props = withDefaults(
  defineProps<{
    kind?: "group" | "key" | "channel" | "model" | "generic";
    mark?: string;
    eyebrow: string;
    title: string;
    subtitle?: string;
    badges?: BadgeItem[];
    stats?: StatItem[];
    detailLabel?: string;
    detailValue?: string;
    selected?: boolean;
  }>(),
  {
    kind: "generic",
    mark: "",
    subtitle: "",
    badges: () => [],
    stats: () => [],
    detailLabel: "",
    detailValue: "",
    selected: false,
  },
);

const markText = computed(() => {
  if (props.mark) return props.mark;
  const marks = {
    group: "G",
    key: "K",
    channel: "C",
    model: "M",
    generic: "R",
  };
  return marks[props.kind];
});

const accentColor = computed(() => {
  const colors = {
    group: "var(--color-accent-brand)",
    key: "var(--color-warning)",
    channel: "var(--color-success)",
    model: "var(--color-accent-brand-hover)",
    generic: "var(--color-text-muted)",
  };
  return colors[props.kind];
});

const kindLabel = computed(() => {
  const labels = {
    group: "Group",
    key: "API Key",
    channel: "Channel",
    model: "Model",
    generic: "Resource",
  };
  return labels[props.kind];
});

const cardClasses = computed(() => [
  "relative min-h-[126px] w-full min-w-0 overflow-hidden rounded-[var(--radius-lg)] transition-colors",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.026))]",
  "!shadow-none hover:border-[var(--color-border-strong)]",
  props.selected &&
    "border-[color-mix(in_srgb,var(--resource-accent)_42%,transparent)] bg-[radial-gradient(circle_at_96%_8%,color-mix(in_srgb,var(--resource-accent)_14%,transparent),transparent_34%),rgba(255,255,255,0.036)]",
]);

const markClasses = computed(() => [
  "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border text-[13px] font-bold",
  props.selected
    ? "border-[color-mix(in_srgb,var(--resource-accent)_38%,transparent)] bg-[color-mix(in_srgb,var(--resource-accent)_14%,transparent)] text-[var(--color-text-primary)]"
    : "border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-secondary)]",
]);
</script>

<template>
  <SlimePanel
    data-testid="slime-resource-card"
    data-component-id="SlimeResourceCard"
    data-layout="adaptive"
    :data-resource-kind="kind"
    :data-selected="selected ? 'true' : undefined"
    :padded="false"
    :class="cardClasses"
    :style="{ '--resource-accent': accentColor }"
  >
    <div
      class="absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-r-full bg-[var(--resource-accent)] opacity-80"
    />

    <div class="relative flex min-w-0 flex-col p-3">
      <div class="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5">
        <div :class="markClasses">
          {{ markText }}
        </div>

        <div class="min-w-0">
          <h3 class="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
            {{ title }}
          </h3>
          <p class="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
            <span>{{ eyebrow }}</span>
            <span v-if="subtitle"> · {{ subtitle }}</span>
          </p>
        </div>

        <div
          v-if="$slots.actions || badges.length"
          class="flex min-w-0 shrink-0 items-center justify-end gap-1.5"
        >
          <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1">
            <slot name="actions" />
          </div>

          <div v-if="badges.length" class="flex min-w-0 flex-wrap justify-end gap-1.5">
            <SlimeBadge
              v-for="badge in badges"
              :key="`${badge.label}:${badge.variant ?? 'neutral'}`"
              :variant="badge.variant ?? 'neutral'"
            >
              {{ badge.label }}
            </SlimeBadge>
          </div>
        </div>
      </div>

      <div v-if="stats.length" class="mt-3 flex min-w-0 flex-wrap gap-1.5">
        <div
          v-for="stat in stats"
          :key="stat.label"
          data-testid="slime-resource-fact"
          class="inline-flex min-h-[26px] max-w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.026)] px-2 py-1 text-[11px] text-[var(--color-text-muted)]"
        >
          <span class="shrink-0">{{ stat.label }}</span>
          <strong class="min-w-0 truncate font-semibold text-[var(--color-text-secondary)]">
            {{ stat.value }}
          </strong>
        </div>
      </div>

      <div
        v-if="detailLabel || detailValue"
        data-testid="slime-resource-detail"
        class="mt-3 flex min-w-0 items-center justify-between gap-2.5 border-t border-[var(--color-border-subtle)] pt-2.5 text-[11px] text-[var(--color-text-muted)]"
      >
        <span class="min-w-0 truncate">
          {{ detailValue || "-" }}
        </span>
        <span class="shrink-0 font-semibold text-[var(--color-text-secondary)]">
          {{ kindLabel }}
        </span>
      </div>
    </div>
  </SlimePanel>
</template>
