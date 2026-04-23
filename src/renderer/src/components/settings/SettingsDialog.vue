<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Overlay -->
      <div
        data-testid="settings-overlay"
        class="absolute inset-0 bg-black/50"
        @click="$emit('update:open', false)"
      />
      <!-- Dialog -->
      <div
        class="relative flex h-[400px] w-[600px] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <!-- Left nav -->
        <div class="flex w-48 shrink-0 flex-col border-r border-border bg-sidebar p-3">
          <h2
            class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            设置
          </h2>
          <button class="rounded-md bg-muted px-3 py-1.5 text-left text-sm text-foreground">
            LLM Provider
          </button>
        </div>
        <!-- Right content -->
        <div class="flex flex-1 flex-col overflow-y-auto p-5">
          <ProviderSettings />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import ProviderSettings from "./ProviderSettings.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("update:open", false);
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
