<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

withDefaults(
  defineProps<{
    sidebarWidth?: string;
    rightWidth?: number;
    minCenterWidth?: number;
  }>(),
  {
    sidebarWidth: "220px",
    rightWidth: 320,
    minCenterWidth: 280,
  },
);

const emit = defineEmits<{
  mainElement: [element: HTMLElement | null];
  dividerMousedown: [event: MouseEvent];
  dividerDoubleclick: [];
}>();

const mainElement = ref<HTMLElement | null>(null);

onMounted(() => {
  emit("mainElement", mainElement.value);
});

onBeforeUnmount(() => {
  emit("mainElement", null);
});
</script>

<template>
  <div class="flex h-full bg-[var(--color-app-canvas)]">
    <aside
      v-if="$slots.sidebar"
      class="shrink-0 border-r border-[var(--color-border-subtle)] bg-[var(--color-app-sidebar)]"
      :style="{ width: sidebarWidth }"
    >
      <slot name="sidebar" />
    </aside>

    <div ref="mainElement" class="flex min-w-0 flex-1 overflow-hidden">
      <section class="flex-1 overflow-hidden" :style="{ minWidth: `${minCenterWidth}px` }">
        <slot />
      </section>

      <template v-if="$slots.right">
        <div
          class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-border-strong)]"
          @mousedown="$emit('dividerMousedown', $event)"
          @dblclick="$emit('dividerDoubleclick')"
        >
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <aside
          class="shrink-0 overflow-hidden border-l border-[var(--color-border-subtle)] bg-[var(--color-app-panel)]"
          :style="{ width: `${rightWidth}px` }"
        >
          <slot name="right" />
        </aside>
      </template>
    </div>
  </div>
</template>
