<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";

type AppView = "chatroom" | "schedule" | "gateway" | "agents" | "groupchat";

const props = defineProps<{
  activeView: AppView;
  inspectorOpen?: boolean;
  inspectorAvailable?: boolean;
}>();

defineEmits<{
  toggleInspector: [];
}>();

const viewMeta = computed(() => {
  switch (props.activeView) {
    case "groupchat":
      return { title: "群聊", icon: "lucide:users" };
    case "gateway":
      return { title: "Gateway", icon: "lucide:network" };
    case "schedule":
      return { title: "自动化", icon: "lucide:clock" };
    case "agents":
      return { title: "Agents", icon: "lucide:bot" };
    case "chatroom":
    default:
      return { title: "对齐第二张图 UI", icon: "lucide:edit-3" };
  }
});
</script>

<template>
  <section class="flex h-full min-w-0 flex-col overflow-hidden bg-[var(--color-app-canvas)]">
    <header
      class="flex h-[44px] shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-5"
      style="-webkit-app-region: drag"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md text-[var(--color-text-muted)]"
        >
          <Icon :icon="viewMeta.icon" class="h-[17px] w-[17px]" />
        </div>
        <h1 class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {{ viewMeta.title }}
        </h1>
      </div>

      <div class="flex shrink-0 items-center gap-2" style="-webkit-app-region: no-drag">
        <button
          type="button"
          class="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]"
          title="当前工作区"
        >
          <Icon icon="lucide:globe-2" class="h-[17px] w-[17px] text-[var(--color-text-muted)]" />
          <span>Slime</span>
        </button>
        <SlimeIconButton
          icon="lucide:terminal-square"
          title="终端"
          size="sm"
          class="h-[26px] w-[26px]"
        />
        <div class="h-[18px] w-px bg-[var(--color-border-subtle)]" />
        <SlimeIconButton
          icon="lucide:panel-right"
          :title="inspectorOpen ? '隐藏工具面板' : '显示工具面板'"
          size="sm"
          :disabled="inspectorAvailable === false"
          class="h-[26px] w-[26px]"
          :class="
            inspectorOpen
              ? 'border-[var(--color-border-strong)] bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
              : ''
          "
          @click="$emit('toggleInspector')"
        />
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </div>
  </section>
</template>
