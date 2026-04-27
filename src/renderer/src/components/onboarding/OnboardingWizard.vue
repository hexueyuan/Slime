<script setup lang="ts">
import { ref, reactive } from "vue";
import type { ChannelType, Capability } from "@shared/types/gateway";
import WelcomeStep from "./WelcomeStep.vue";
import AddChannelStep from "./AddChannelStep.vue";
import CapabilityTagStep from "./CapabilityTagStep.vue";
import IdentityCompleteStep from "./IdentityCompleteStep.vue";

const emit = defineEmits<{ done: [] }>();

const currentStep = ref(0);
const TOTAL_STEPS = 4;

const config = reactive({
  channelType: "anthropic" as ChannelType,
  channelName: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  selectedModels: [] as string[],
  modelCapabilities: {} as Record<string, Capability[]>,
  userName: "",
});

function next() {
  if (currentStep.value < TOTAL_STEPS - 1) currentStep.value++;
}
function prev() {
  if (currentStep.value > 0) currentStep.value--;
}

const completing = ref(false);

async function complete() {
  completing.value = true;
  try {
    const invoke = window.electron.ipcRenderer.invoke;
    const gw = (method: string, ...args: unknown[]) =>
      invoke("presenter:call", "gatewayPresenter", method, ...args);
    const cfg = (method: string, ...args: unknown[]) =>
      invoke("presenter:call", "configPresenter", method, ...args);

    // 1. Create channel
    const channel = (await gw("createChannel", {
      name: config.channelName,
      type: config.channelType,
      baseUrls: [config.baseUrl],
      enabled: true,
      priority: 0,
      weight: 1,
    })) as { id: number };

    // 2. Add key
    await gw("addChannelKey", channel.id, config.apiKey);

    // 3. Register models with user-tagged capabilities
    // Built-in groups (chat/reasoning/vision/image_gen) are auto-maintained
    for (const model of config.selectedModels) {
      const caps = config.modelCapabilities[model] || [];
      await gw("createModel", {
        channelId: channel.id,
        modelName: model,
        capabilities: caps,
        priority: 0,
        enabled: true,
      });
    }

    // 4. Save user + mark onboarded
    await cfg("set", "evolution.user", config.userName || "dev");
    await cfg("set", "app.onboarded", true);

    emit("done");
  } finally {
    completing.value = false;
  }
}
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center"
    style="background: linear-gradient(135deg, #1a1025 0%, #0d0d1a 50%, #0a0a12 100%)"
  >
    <!-- Progress dots -->
    <div class="mb-8 flex gap-2.5">
      <div
        v-for="i in TOTAL_STEPS"
        :key="i"
        class="h-2.5 w-2.5 rounded-full transition-all"
        :class="
          i - 1 < currentStep
            ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
            : i - 1 === currentStep
              ? 'bg-violet-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]'
              : 'border-[1.5px] border-violet-900 bg-transparent'
        "
      />
    </div>

    <!-- Step content -->
    <WelcomeStep v-if="currentStep === 0" @next="next" />

    <AddChannelStep
      v-else-if="currentStep === 1"
      v-model:channel-type="config.channelType"
      v-model:channel-name="config.channelName"
      v-model:base-url="config.baseUrl"
      v-model:api-key="config.apiKey"
      v-model:selected-models="config.selectedModels"
      @next="next"
      @prev="prev"
    />

    <CapabilityTagStep
      v-else-if="currentStep === 2"
      v-model:model-capabilities="config.modelCapabilities"
      :selected-models="config.selectedModels"
      @next="next"
      @prev="prev"
    />

    <IdentityCompleteStep
      v-else-if="currentStep === 3"
      v-model:user-name="config.userName"
      :channel-type="config.channelType"
      :channel-name="config.channelName"
      :selected-models="config.selectedModels"
      @complete="complete"
      @prev="prev"
    />
  </div>
</template>
