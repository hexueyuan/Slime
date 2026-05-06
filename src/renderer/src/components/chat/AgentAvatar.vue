<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import type { AgentAvatar } from "@shared/types/agent";

const props = defineProps<{
  avatar?: AgentAvatar | null;
  size?: "sm" | "md" | "lg" | "xl";
}>();

const agentConfig = usePresenter("agentConfigPresenter");

const sizeMap = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5", text: "text-[10px]" },
  md: { box: "h-8 w-8", icon: "h-4 w-4", text: "text-xs" },
  lg: { box: "h-12 w-12", icon: "h-6 w-6", text: "text-sm" },
  xl: { box: "h-32 w-32", icon: "h-16 w-16", text: "text-3xl" },
};

const s = sizeMap[props.size ?? "md"];

const imageUrl = ref<string | null>(null);

watch(
  () => props.avatar,
  async (avatar) => {
    if (avatar?.kind === "image") {
      imageUrl.value = (await agentConfig.getAvatarUrl(avatar.path)) as string;
    } else {
      imageUrl.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- Image mode -->
  <div
    v-if="avatar?.kind === 'image' && imageUrl"
    :class="['flex shrink-0 items-center justify-center overflow-hidden rounded-full', s.box]"
  >
    <img :src="imageUrl" class="h-full w-full object-cover" />
  </div>

  <!-- Lucide icon mode -->
  <div
    v-else-if="avatar?.kind === 'lucide'"
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
    :class="['flex shrink-0 items-center justify-center rounded-full', s.box]"
    style="background-color: color-mix(in srgb, var(--agent-color, #a855f7) 15%, transparent)"
  >
    <Icon icon="lucide:bot" :class="s.icon" style="color: var(--agent-color, #a855f7)" />
  </div>
</template>
