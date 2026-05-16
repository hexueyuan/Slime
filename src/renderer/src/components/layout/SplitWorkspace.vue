<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

withDefaults(
  defineProps<{
    sidebarWidth?: string;
    rightWidth?: number;
    rightOpen?: boolean;
    minCenterWidth?: number;
  }>(),
  {
    sidebarWidth: "220px",
    rightWidth: 320,
    rightOpen: true,
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
          :class="[
            'group relative flex shrink-0 cursor-col-resize items-center justify-center bg-[var(--color-border-subtle)] transition-[width,opacity,background-color] duration-300 ease-out hover:bg-[var(--color-border-strong)]',
            rightOpen ? 'w-px opacity-100' : 'w-0 opacity-0 pointer-events-none',
          ]"
          @mousedown="$emit('dividerMousedown', $event)"
          @dblclick="$emit('dividerDoubleclick')"
        >
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <aside
          data-testid="split-right-pane"
          :data-open="rightOpen ? 'true' : 'false'"
          :class="[
            'shrink-0 overflow-hidden bg-[var(--color-app-panel)] transition-[width,border-color] duration-300 ease-out',
            rightOpen
              ? 'border-l border-[var(--color-border-subtle)]'
              : 'border-l border-transparent',
          ]"
          :style="{ width: rightOpen ? `${rightWidth}px` : '0px' }"
        >
          <div
            :class="[
              'h-full transition-[opacity,transform] duration-300 ease-out',
              rightOpen ? 'translate-x-0 opacity-100' : 'translate-x-5 opacity-0',
            ]"
          >
            <slot name="right" />
          </div>
        </aside>
      </template>
    </div>
  </div>
</template>
