<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { AgentAvatar } from "@shared/types/agent";

const props = defineProps<{
  avatar?: AgentAvatar | null;
  size?: "sm" | "md" | "lg";
}>();

const sizeMap = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5", text: "text-[10px]" },
  md: { box: "h-8 w-8", icon: "h-4 w-4", text: "text-xs" },
  lg: { box: "h-12 w-12", icon: "h-6 w-6", text: "text-sm" },
};

const s = sizeMap[props.size ?? "md"];
</script>

<template>
  <!-- Lucide icon mode -->
  <div
    v-if="avatar?.kind === 'lucide'"
    :class="['flex shrink-0 items-center justify-center rounded-full bg-muted', s.box]"
  >
    <Icon :icon="avatar.icon" :class="s.icon" :style="{ color: avatar.color ?? '#a855f7' }" />
  </div>

  <!-- Monogram mode -->
  <div
    v-else-if="avatar?.kind === 'monogram'"
    :class="['flex shrink-0 items-center justify-center rounded-full text-white', s.box, s.text]"
    :style="{ backgroundColor: avatar.backgroundColor ?? '#7c3aed' }"
  >
    {{ avatar.text }}
  </div>

  <!-- Default -->
  <div
    v-else
    :class="['flex shrink-0 items-center justify-center rounded-full bg-violet-500/15', s.box]"
  >
    <Icon icon="lucide:bot" :class="[s.icon, 'text-violet-400']" />
  </div>
</template>
