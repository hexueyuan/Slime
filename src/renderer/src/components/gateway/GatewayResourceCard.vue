<script setup lang="ts">
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

withDefaults(
  defineProps<{
    kind: "group" | "key";
    eyebrow: string;
    title: string;
    subtitle?: string;
    badges?: BadgeItem[];
    stats?: StatItem[];
    detailLabel?: string;
    detailValue?: string;
  }>(),
  {
    subtitle: "",
    badges: () => [],
    stats: () => [],
    detailLabel: "",
    detailValue: "",
  },
);
</script>

<template>
  <SlimePanel
    data-testid="gateway-resource-card"
    :data-resource-kind="kind"
    class="min-w-0 transition-colors hover:border-[var(--color-border-strong)]"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
          {{ eyebrow }}
        </p>
        <h3 class="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {{ title }}
        </h3>
        <p v-if="subtitle" class="mt-1 truncate text-xs text-[var(--color-text-muted)]">
          {{ subtitle }}
        </p>
      </div>

      <div v-if="badges.length" class="flex shrink-0 flex-wrap justify-end gap-1.5">
        <SlimeBadge
          v-for="badge in badges"
          :key="`${badge.label}:${badge.variant ?? 'neutral'}`"
          :variant="badge.variant ?? 'neutral'"
        >
          {{ badge.label }}
        </SlimeBadge>
      </div>
    </div>

    <div v-if="stats.length" class="mt-4 grid min-w-0 grid-cols-2 gap-2">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control-hover)] px-2 py-1.5"
      >
        <p class="truncate text-[11px] text-[var(--color-text-muted)]">{{ stat.label }}</p>
        <p class="mt-0.5 truncate text-xs font-semibold text-[var(--color-text-primary)]">
          {{ stat.value }}
        </p>
      </div>
    </div>

    <div
      v-if="detailLabel || detailValue"
      class="mt-3 min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-app-canvas)] px-2 py-1.5"
    >
      <p v-if="detailLabel" class="truncate text-[11px] text-[var(--color-text-muted)]">
        {{ detailLabel }}
      </p>
      <p class="truncate text-xs font-medium text-[var(--color-text-primary)]">
        {{ detailValue || "-" }}
      </p>
    </div>
  </SlimePanel>
</template>
