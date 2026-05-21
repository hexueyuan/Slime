<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsDialog from "../settings/SettingsDialog.vue";

type AppView = "chatroom" | "schedule" | "gateway" | "agents" | "groupchat";

withDefaults(
  defineProps<{
    activeView: AppView;
    collapsed?: boolean;
    fullscreenLike?: boolean;
  }>(),
  {
    collapsed: false,
    fullscreenLike: false,
  },
);

const emit = defineEmits<{
  "update:activeView": [view: AppView];
  toggleSidebar: [];
}>();

const showSettings = ref(false);

function selectView(view: AppView) {
  emit("update:activeView", view);
}

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

const projectConversationItems = [
  { title: "对齐第二张图 UI", shortcut: "⌘1", active: true },
  { title: "实现 runtime profile 数据锁", shortcut: "⌘2" },
  { title: "优化 gateway 卡顿", shortcut: "⌘3" },
  { title: "修复窗口尺寸预设", shortcut: "⌘4" },
  { title: "调整侧边栏滚动", shortcut: "⌘5" },
  { title: "迁移 Gateway 资源卡", shortcut: "⌘6" },
  { title: "补齐 Schedule Kit", shortcut: "⌘7" },
  { title: "验证最小窗口布局", shortcut: "⌘8" },
  { title: "整理 UI 组件规范", shortcut: "⌘9" },
];

const recentConversationItems = [
  { title: "了解红灯测试", shortcut: "⌘0" },
  { title: "排查隐藏滚动条表现", shortcut: "" },
  { title: "设计 Agent 管理页", shortcut: "" },
  { title: "检查 Chatroom 空状态", shortcut: "" },
  { title: "复盘 Gateway 日志密度", shortcut: "" },
  { title: "确认设置页信息层级", shortcut: "" },
];
</script>

<template>
  <aside
    data-testid="app-sidebar-nav"
    class="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
  >
    <div class="relative flex min-h-0 flex-1 flex-col">
      <div
        class="mb-5 flex h-[52px] items-start pt-[4px]"
        :class="collapsed ? 'justify-center px-2' : 'px-4'"
        style="-webkit-app-region: drag"
      >
        <div
          v-if="!collapsed && !fullscreenLike"
          data-testid="sidebar-traffic-spacer"
          class="h-6 w-[86px] shrink-0"
          aria-hidden="true"
        />
        <button
          data-testid="sidebar-toggle"
          type="button"
          class="grid h-[26px] w-[26px] place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
          :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
          style="-webkit-app-region: no-drag"
          @click="emit('toggleSidebar')"
        >
          <Icon :icon="collapsed ? 'lucide:menu' : 'lucide:panel-left'" class="h-[17px] w-[17px]" />
        </button>
        <button
          v-if="!collapsed"
          type="button"
          class="ml-[2px] grid h-[26px] w-[26px] place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          title="返回"
          style="-webkit-app-region: no-drag"
        >
          <Icon icon="lucide:chevron-left" class="h-[17px] w-[17px]" />
        </button>
        <button
          v-if="!collapsed"
          type="button"
          class="ml-[2px] grid h-[26px] w-[26px] place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]"
          title="前进"
          style="-webkit-app-region: no-drag"
        >
          <Icon icon="lucide:chevron-right" class="h-[17px] w-[17px]" />
        </button>
      </div>

      <nav class="space-y-1" :class="collapsed ? 'px-2' : 'px-3'">
        <button
          v-for="item in primaryItems"
          :key="item.view"
          type="button"
          :data-testid="item.testId"
          :title="collapsed ? item.label : undefined"
          :aria-label="collapsed ? item.label : undefined"
          :class="[
            'flex min-h-[29px] w-full items-center rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-2 px-2 text-left',
            activeView === item.view
              ? 'bg-[var(--color-control-hover)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          ]"
          @click="selectView(item.view)"
        >
          <Icon :icon="item.icon" class="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </button>
      </nav>

      <div
        v-if="!collapsed"
        data-testid="sidebar-scroll-area"
        class="sidebar-scrollbar-hidden mt-2 min-h-0 flex-1 overflow-y-auto pb-2"
      >
        <div class="px-5 pt-5 text-xs font-semibold text-[var(--color-text-muted)]">项目</div>
        <div class="mt-3 flex items-center gap-2 px-5 text-sm text-[var(--color-text-secondary)]">
          <Icon icon="lucide:folder" class="h-4 w-4 text-[var(--color-text-muted)]" />
          <span class="min-w-0 truncate">Slime</span>
        </div>
        <div class="mt-2 space-y-1 px-3">
          <button
            v-for="item in projectConversationItems"
            :key="item.title"
            type="button"
            :class="[
              'flex min-h-[31px] w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-left text-sm font-medium transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
              item.active
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)]',
            ]"
          >
            <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
            <span
              v-if="item.shortcut"
              class="rounded-full bg-[var(--color-control-hover)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
            >
              {{ item.shortcut }}
            </span>
          </button>
        </div>
        <div class="px-5 pt-5 text-xs font-semibold text-[var(--color-text-muted)]">对话</div>
        <div class="mt-2 space-y-1 px-3">
          <button
            v-for="item in recentConversationItems"
            :key="item.title"
            type="button"
            class="flex min-h-[31px] w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
          >
            <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
            <span
              v-if="item.shortcut"
              class="rounded-full bg-[var(--color-control-hover)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)]"
            >
              {{ item.shortcut }}
            </span>
          </button>
        </div>
      </div>

      <div v-else class="flex-1" />

      <button
        data-testid="sidebar-status"
        type="button"
        :class="[
          'mb-2 min-h-[34px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          collapsed
            ? 'mx-auto grid h-[34px] w-[34px] place-items-center px-0'
            : 'mx-3 flex items-center justify-between px-2.5',
        ]"
        title="测试连接"
        :aria-label="collapsed ? '测试连接' : undefined"
      >
        <span v-if="!collapsed">测试</span>
        <span
          class="h-2 w-2 rounded-full bg-[var(--color-success)] shadow-[0_0_0_4px_rgba(76,217,135,0.11)]"
        />
      </button>
      <button
        data-testid="sidebar-settings"
        type="button"
        :class="[
          'flex min-h-[29px] items-center rounded-md text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
          collapsed ? 'mx-auto h-[34px] w-[34px] justify-center px-0' : 'mx-3 gap-2 px-2',
        ]"
        title="设置"
        :aria-label="collapsed ? '设置' : undefined"
        @click="showSettings = true"
      >
        <Icon icon="lucide:settings" class="h-4 w-4 text-[var(--color-text-muted)]" />
        <span v-if="!collapsed">设置</span>
      </button>
    </div>

    <SettingsDialog v-model:open="showSettings" />
  </aside>
</template>

<style scoped>
.sidebar-scrollbar-hidden {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sidebar-scrollbar-hidden::-webkit-scrollbar {
  display: none;
}
</style>
