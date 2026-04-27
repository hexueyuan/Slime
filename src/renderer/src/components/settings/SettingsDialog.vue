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
        class="relative flex h-[480px] w-[640px] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <!-- Left nav -->
        <div class="flex w-48 shrink-0 flex-col border-r border-border bg-sidebar p-3">
          <h2
            class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            设置
          </h2>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'profile'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'profile'"
          >
            个人资料
          </button>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'gateway'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'gateway'"
          >
            网关
          </button>
        </div>
        <!-- Right content -->
        <div class="flex flex-1 flex-col overflow-y-auto p-5">
          <ProfileSettings v-if="activeTab === 'profile'" />
          <GatewaySettings v-else-if="activeTab === 'gateway'" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import GatewaySettings from "./GatewaySettings.vue";
import ProfileSettings from "./ProfileSettings.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const activeTab = ref<"profile" | "gateway">("profile");

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("update:open", false);
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
