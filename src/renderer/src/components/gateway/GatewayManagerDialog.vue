<script setup lang="ts">
import { Icon } from "@iconify/vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    widthClass?: string;
  }>(),
  {
    subtitle: "",
    widthClass: "w-[min(960px,calc(100vw-48px))]",
  },
);

const emit = defineEmits<{
  close: [];
}>();

const disableTeleport = import.meta.env.MODE === "test";

function close() {
  emit("close");
}
</script>

<template>
  <Teleport to="body" :disabled="disableTeleport">
    <div
      v-if="open"
      data-testid="manager-overlay"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      @click="close"
    >
      <section
        :class="[
          widthClass,
          'min-h-0 max-h-[min(760px,82vh)] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-floating)] flex flex-col',
        ]"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.stop
      >
        <header class="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-sm font-medium text-foreground">
              {{ title }}
            </h2>
            <p v-if="subtitle" class="mt-1 text-xs leading-5 text-muted-foreground">
              {{ subtitle }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <slot name="actions" />
            <button
              data-testid="manager-close"
              type="button"
              title="关闭"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand)]"
              @click="close"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>
