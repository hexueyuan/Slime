<!-- src/renderer/src/components/chat/ProfileModal.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentChatStore } from "@/stores/agentChat";
import { useProfileModal } from "@/composables/useProfileModal";
import AgentAvatarComp from "./AgentAvatar.vue";

const { visible, profile, close } = useProfileModal();
const agentStore = useAgentStore();
const chatStore = useAgentChatStore();

const agent = computed(() => {
  const p = profile.value;
  if (p?.type === "agent") {
    return agentStore.agents.find((a) => a.id === p.agentId) ?? null;
  }
  return null;
});

const userProfile = computed(() => chatStore.userProfile);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="close"
    >
      <div class="relative w-[320px] rounded-xl bg-background p-6 shadow-xl border border-border">
        <!-- 关闭按钮 -->
        <button
          class="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="close"
        >
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>

        <!-- Agent 资料 -->
        <template v-if="profile?.type === 'agent' && agent">
          <div class="flex flex-col items-center gap-4">
            <AgentAvatarComp :avatar="agent.avatar ?? null" size="xl" />
            <div class="w-full">
              <div class="text-center text-base font-semibold text-foreground">
                {{ agent.name }}
              </div>
              <div
                v-if="agent.description"
                class="mt-2 text-sm text-muted-foreground leading-relaxed"
              >
                {{ agent.description }}
              </div>
            </div>
          </div>
        </template>

        <!-- 用户资料 -->
        <template v-else-if="profile?.type === 'user'">
          <div class="flex flex-col items-center gap-4">
            <AgentAvatarComp
              :avatar="
                userProfile?.avatar ?? { kind: 'monogram', text: 'U', backgroundColor: '#3b82f6' }
              "
              size="xl"
            />
            <div class="w-full">
              <div class="text-center text-base font-semibold text-foreground">
                {{ userProfile?.name ?? "未设置名称" }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
