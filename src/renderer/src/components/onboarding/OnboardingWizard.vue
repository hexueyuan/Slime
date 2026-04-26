<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import type { ChannelType, ModelSlot } from "@shared/types/gateway";
import WelcomeStep from "./WelcomeStep.vue";
import AddChannelStep from "./AddChannelStep.vue";
import SlotMappingStep from "./SlotMappingStep.vue";
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
  slotMapping: {} as Record<string, string>,
  userName: "",
});

// When only 1 model selected, auto-fill all slots
watch(
  () => config.selectedModels,
  (models) => {
    if (models.length === 1) {
      config.slotMapping = {
        reasoning_auto: models[0],
        reasoning_lite: models[0],
        reasoning_pro: models[0],
        reasoning_max: models[0],
        chat: models[0],
      };
    }
  },
);

function next() {
  if (currentStep.value < TOTAL_STEPS - 1) currentStep.value++;
}
function prev() {
  if (currentStep.value > 0) currentStep.value--;
}

const SLOT_MAP: Record<string, ModelSlot> = {
  reasoning_auto: { category: "text", tier: "reasoning", level: "auto" },
  reasoning_lite: { category: "text", tier: "reasoning", level: "lite" },
  reasoning_pro: { category: "text", tier: "reasoning", level: "pro" },
  reasoning_max: { category: "text", tier: "reasoning", level: "max" },
  chat: { category: "text", tier: "chat" },
};

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

    // 3. Create groups for selected models
    const groupMap = new Map<string, number>();
    for (const model of config.selectedModels) {
      const group = (await gw("createGroup", {
        name: model,
        balanceMode: "failover",
      })) as { id: number };
      await gw("setGroupItems", group.id, [
        {
          channelId: channel.id,
          modelName: model,
          priority: 0,
          weight: 1,
        },
      ]);
      groupMap.set(model, group.id);
    }

    // 4. Assign slots
    for (const [slotKey, modelName] of Object.entries(config.slotMapping)) {
      if (!modelName) continue;
      const groupId = groupMap.get(modelName);
      const slot = SLOT_MAP[slotKey];
      if (groupId && slot) {
        await gw("updateGroup", groupId, { slot });
      }
    }

    // 5. Save user + mark onboarded
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

    <SlotMappingStep
      v-else-if="currentStep === 2"
      v-model:slot-mapping="config.slotMapping"
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
      :slot-mapping="config.slotMapping"
      @complete="complete"
      @prev="prev"
    />
  </div>
</template>
