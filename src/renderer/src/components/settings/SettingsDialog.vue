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
        class="relative flex h-[560px] w-[680px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] shadow-[var(--shadow-floating)]"
      >
        <!-- Left nav -->
        <div
          class="flex w-48 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-app-sidebar)] p-3"
        >
          <h2 class="mb-3 px-2 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
            设置
          </h2>
          <SlimeListItem
            :selected="activeTab === 'profile'"
            compact
            @select="activeTab = 'profile'"
          >
            个人资料
          </SlimeListItem>
          <SlimeListItem
            :selected="activeTab === 'gateway'"
            compact
            @select="activeTab = 'gateway'"
          >
            网关
          </SlimeListItem>
          <SlimeListItem
            :selected="activeTab === 'general'"
            compact
            @select="activeTab = 'general'"
          >
            通用
          </SlimeListItem>
          <SlimeListItem :selected="activeTab === 'mcp'" compact @select="activeTab = 'mcp'">
            MCP
          </SlimeListItem>
          <SlimeListItem :selected="activeTab === 'update'" compact @select="activeTab = 'update'">
            更新
          </SlimeListItem>
        </div>
        <!-- Right content -->
        <div class="flex flex-1 flex-col overflow-y-auto p-5">
          <ProfileSettings v-if="activeTab === 'profile'" />
          <GatewaySettings v-else-if="activeTab === 'gateway'" />
          <GeneralSettings v-else-if="activeTab === 'general'" />
          <MCPSettings v-else-if="activeTab === 'mcp'" />
          <UpdateSettings v-else-if="activeTab === 'update'" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import GatewaySettings from "./GatewaySettings.vue";
import ProfileSettings from "./ProfileSettings.vue";
import GeneralSettings from "./GeneralSettings.vue";
import UpdateSettings from "./UpdateSettings.vue";
import MCPSettings from "./MCPSettings.vue";
import SlimeListItem from "@/components/ui/SlimeListItem.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const activeTab = ref<"profile" | "gateway" | "general" | "mcp" | "update">("profile");

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("update:open", false);
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
