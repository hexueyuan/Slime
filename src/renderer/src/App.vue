<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppSidebar from "./components/AppSidebar.vue";
import ChatroomPanel from "./views/ChatroomPanel.vue";
import GatewayPanel from "./views/GatewayPanel.vue";
import EvolabPanel from "./views/EvolabPanel.vue";
import OnboardingWizard from "./components/onboarding/OnboardingWizard.vue";
import { usePresenter } from "@/composables/usePresenter";

const activeView = ref<"chatroom" | "gateway" | "evolab">("chatroom");

const configPresenter = usePresenter("configPresenter");
const needsOnboarding = ref<boolean | null>(null);

onMounted(async () => {
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
    <div v-else class="flex h-full flex-col bg-sidebar">
      <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
      <div class="flex min-h-0 flex-1">
        <AppSidebar v-model:active-view="activeView" />
        <div
          class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
        >
          <ChatroomPanel v-if="activeView === 'chatroom'" />
          <GatewayPanel v-else-if="activeView === 'gateway'" />
          <EvolabPanel v-else-if="activeView === 'evolab'" />
        </div>
      </div>
    </div>
  </div>
</template>
