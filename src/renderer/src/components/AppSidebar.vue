<template>
  <div
    data-testid="app-sidebar"
    class="flex w-[45px] shrink-0 flex-col items-center bg-sidebar pt-2"
  >
    <button
      data-testid="sidebar-chatroom"
      :class="[
        'flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'chatroom'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="对话"
      @click="$emit('update:activeView', 'chatroom')"
    >
      <Icon icon="lucide:message-square" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-groupchat"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'groupchat'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="群聊"
      @click="$emit('update:activeView', 'groupchat')"
    >
      <Icon icon="lucide:users" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-schedule"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'schedule'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="日程"
      @click="$emit('update:activeView', 'schedule')"
    >
      <Icon icon="lucide:calendar-check" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-gateway"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'gateway'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="LLM 网关"
      @click="$emit('update:activeView', 'gateway')"
    >
      <Icon icon="lucide:network" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-agents"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'agents'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="Agent 管理"
      @click="$emit('update:activeView', 'agents')"
    >
      <Icon icon="lucide:bot" class="h-5 w-5" />
    </button>

    <div class="flex-1" />

    <button
      data-testid="sidebar-settings"
      class="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      title="设置"
      @click="showSettings = true"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsDialog from "./settings/SettingsDialog.vue";

defineProps<{
  activeView: "chatroom" | "schedule" | "gateway" | "agents" | "groupchat";
}>();

defineEmits<{
  "update:activeView": [view: "chatroom" | "schedule" | "gateway" | "agents" | "groupchat"];
}>();

const showSettings = ref(false);
</script>
