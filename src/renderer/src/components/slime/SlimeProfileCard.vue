<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    subtitle?: string;
    description?: string;
    toneColor?: string;
  }>(),
  {
    subtitle: "",
    description: "",
    toneColor: "var(--color-accent-brand)",
  },
);
</script>

<template>
  <article
    :style="{ '--profile-tone': toneColor }"
    class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
  >
    <div class="flex items-center gap-3">
      <div
        class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--profile-tone)_18%,transparent)] text-[var(--color-text-primary)] ring-1 ring-[color:var(--profile-tone)]"
      >
        <slot name="avatar">
          <span class="text-sm font-semibold">{{ name.slice(0, 1) }}</span>
        </slot>
      </div>
      <div class="min-w-0">
        <h3 class="truncate text-sm font-semibold text-[var(--color-text-primary)]">{{ name }}</h3>
        <p v-if="subtitle" class="truncate text-xs text-[var(--color-text-muted)]">
          {{ subtitle }}
        </p>
      </div>
    </div>
    <p
      v-if="description"
      class="mt-3 line-clamp-3 text-xs leading-relaxed text-[var(--color-text-secondary)]"
    >
      {{ description }}
    </p>
    <div v-if="$slots.actions" class="mt-4 flex items-center gap-2">
      <slot name="actions" />
    </div>
  </article>
</template>
