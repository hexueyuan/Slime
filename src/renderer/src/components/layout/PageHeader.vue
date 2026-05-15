<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header
    class="flex min-h-14 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-5"
  >
    <div class="min-w-0">
      <h1 class="truncate text-base font-semibold text-[var(--color-text-primary)]">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
        {{ subtitle }}
      </p>
    </div>
    <div v-if="$slots.actions" class="ml-4 flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
