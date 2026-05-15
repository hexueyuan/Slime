<script setup lang="ts">
import { ref, onMounted, shallowRef, watch, markRaw } from "vue";
import AppShell from "./components/layout/AppShell.vue";
import AppSidebarNav from "./components/layout/AppSidebarNav.vue";
import WorkspaceCanvas from "./components/layout/WorkspaceCanvas.vue";
import ChatroomPanel from "./views/ChatroomPanel.vue";
import GatewayPanel from "./views/GatewayPanel.vue";
import SchedulePanel from "./views/SchedulePanel.vue";
import AgentPanel from "./views/AgentPanel.vue";
import GroupChatPanel from "./views/GroupChatPanel.vue";
import OnboardingWizard from "./components/onboarding/OnboardingWizard.vue";
import { usePresenter } from "@/composables/usePresenter";
import ProfileModal from "./components/chat/ProfileModal.vue";

const viewComponents: Record<string, object> = {
  chatroom: markRaw(ChatroomPanel),
  schedule: markRaw(SchedulePanel),
  gateway: markRaw(GatewayPanel),
  agents: markRaw(AgentPanel),
  groupchat: markRaw(GroupChatPanel),
};

const activeView = ref<"chatroom" | "schedule" | "gateway" | "agents" | "groupchat">("chatroom");
const currentComponent = shallowRef<object>(viewComponents.chatroom);

watch(activeView, (v) => {
  currentComponent.value = viewComponents[v];
});

const configPresenter = usePresenter("configPresenter");
const needsOnboarding = ref<boolean | null>(null);

onMounted(async () => {
  // Check if this is a detached group chat window
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("detached") === "1") {
    activeView.value = "groupchat";
    needsOnboarding.value = false;
    return;
  }
  const onboarded = await configPresenter.get("app.onboarded");
  needsOnboarding.value = !onboarded;
});

async function onOnboardingDone() {
  needsOnboarding.value = false;
}
</script>

<template>
  <div class="h-screen w-screen bg-background text-foreground">
    <!-- Loading -->
    <div
      v-if="needsOnboarding === null"
      class="flex h-full items-center justify-center bg-background"
    >
      <div class="text-muted-foreground">加载中...</div>
    </div>

    <!-- Onboarding -->
    <div v-else-if="needsOnboarding" class="h-full overflow-y-auto">
      <OnboardingWizard @done="onOnboardingDone" />
    </div>

    <!-- Main layout -->
    <AppShell v-else>
      <template #sidebar>
        <AppSidebarNav v-model:active-view="activeView" />
      </template>
      <WorkspaceCanvas>
        <KeepAlive>
          <component :is="currentComponent" :key="activeView" />
        </KeepAlive>
      </WorkspaceCanvas>
    </AppShell>
    <ProfileModal />
  </div>
</template>
