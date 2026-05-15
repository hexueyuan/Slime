<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsDialog from "../settings/SettingsDialog.vue";

type AppView = "chatroom" | "schedule" | "gateway" | "agents" | "groupchat";

defineProps<{
  activeView: AppView;
}>();

defineEmits<{
  "update:activeView": [view: AppView];
}>();

const showSettings = ref(false);

const primaryItems: Array<{
  view: AppView;
  label: string;
  icon: string;
  testId: string;
}> = [
  {
    view: "chatroom",
    label: "新对话",
    icon: "lucide:edit-3",
    testId: "sidebar-chatroom",
  },
  {
    view: "groupchat",
    label: "群聊",
    icon: "lucide:users",
    testId: "sidebar-groupchat",
  },
  {
    view: "gateway",
    label: "Gateway",
    icon: "lucide:network",
    testId: "sidebar-gateway",
  },
  {
    view: "schedule",
    label: "自动化",
    icon: "lucide:clock",
    testId: "sidebar-schedule",
  },
  {
    view: "agents",
    label: "Agents",
    icon: "lucide:bot",
    testId: "sidebar-agents",
  },
];
</script>

<template>
  <aside
    data-testid="app-sidebar"
    class="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-app-sidebar)] px-3 py-5 backdrop-blur-2xl"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_55%_8%,rgba(255,255,255,0.055),transparent_28%),radial-gradient(circle_at_14%_52%,rgba(255,255,255,0.028),transparent_34%)]"
    />
    <div class="relative flex min-h-0 flex-1 flex-col">
      <div class="mb-7 flex h-6 items-center gap-3 pl-1" style="-webkit-app-region: drag">
        <div class="mr-2 flex gap-2.5">
          <span class="h-3 w-3 rounded-full bg-[#8f8f90]" />
          <span class="h-3 w-3 rounded-full bg-[#8f8f90]" />
          <span class="h-3 w-3 rounded-full bg-[#8f8f90]" />
        </div>
        <button
          type="button"
          class="grid h-6 w-6 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          title="收拢侧边栏"
          style="-webkit-app-region: no-drag"
        >
          <Icon icon="lucide:panel-left" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="grid h-6 w-6 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          title="返回"
          style="-webkit-app-region: no-drag"
        >
          <Icon icon="lucide:chevron-left" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="grid h-6 w-6 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          title="前进"
          style="-webkit-app-region: no-drag"
        >
          <Icon icon="lucide:chevron-right" class="h-4 w-4" />
        </button>
      </div>

      <nav class="space-y-1">
        <button
          v-for="item in primaryItems"
          :key="item.view"
          type="button"
          :data-testid="item.testId"
          :class="[
            'flex min-h-[29px] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
            activeView === item.view
              ? 'bg-[var(--color-control-hover)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          ]"
          @click="$emit('update:activeView', item.view)"
        >
          <Icon :icon="item.icon" class="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </nav>

      <div class="mt-7 px-2 text-xs font-semibold text-[var(--color-text-muted)]">项目</div>
      <div class="mt-3 flex items-center gap-2 px-2 text-sm text-[var(--color-text-secondary)]">
        <Icon icon="lucide:folder" class="h-4 w-4 text-[var(--color-text-muted)]" />
        <span>Slime</span>
      </div>
      <div class="mt-2 space-y-1">
        <button
          type="button"
          class="flex min-h-[31px] w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-left text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-control-hover)]"
        >
          <span class="min-w-0 flex-1 truncate">对齐第二张图 UI</span>
          <span
            class="rounded-full bg-[var(--color-control-hover)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
          >
            ⌘1
          </span>
        </button>
        <button
          type="button"
          class="flex min-h-[31px] w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        >
          <span class="min-w-0 flex-1 truncate">实现 runtime profile 数据锁</span>
          <span
            class="rounded-full bg-[var(--color-control-hover)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
          >
            ⌘2
          </span>
        </button>
      </div>

      <div class="flex-1" />

      <button
        type="button"
        class="mb-2 flex min-h-[34px] w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        title="测试连接"
      >
        <span>测试</span>
        <span
          class="h-2 w-2 rounded-full bg-[var(--color-success)] shadow-[0_0_0_4px_rgba(76,217,135,0.11)]"
        />
      </button>
      <button
        data-testid="sidebar-settings"
        type="button"
        class="flex min-h-[29px] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
        title="设置"
        @click="showSettings = true"
      >
        <Icon icon="lucide:settings" class="h-4 w-4 text-[var(--color-text-muted)]" />
        <span>设置</span>
      </button>
    </div>

    <SettingsDialog v-model:open="showSettings" />
  </aside>
</template>
