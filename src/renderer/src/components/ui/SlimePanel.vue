<script setup lang="ts">
withDefaults(
  defineProps<{
    padded?: boolean;
  }>(),
  {
    padded: true,
  },
);
</script>

<template>
  <section
    :class="[
      'rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] shadow-[var(--shadow-panel)]',
      padded && 'p-4',
    ]"
  >
    <slot />
  </section>
</template>
