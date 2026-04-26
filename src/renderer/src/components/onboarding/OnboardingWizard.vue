<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useConfigStore } from '@/stores/config'
import { usePresenter } from '@/composables/usePresenter'
import WelcomeStep from './WelcomeStep.vue'
import ProviderStep from './ProviderStep.vue'
import VerifyStep from './VerifyStep.vue'
import IdentityStep from './IdentityStep.vue'
import CompleteStep from './CompleteStep.vue'

const emit = defineEmits<{ done: [] }>()
const configStore = useConfigStore()
const agentPresenter = usePresenter('agentPresenter')

const currentStep = ref(0)
const TOTAL_STEPS = 5

const config = reactive({
  provider: 'anthropic' as 'anthropic' | 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',
  userName: '',
})

const verifyResult = ref<{ success: boolean; error?: string; modelName?: string } | null>(null)
const verifying = ref(false)
const skippedVerify = ref(false)

function next() {
  if (currentStep.value < TOTAL_STEPS - 1) currentStep.value++
}

function prev() {
  if (currentStep.value > 0) currentStep.value--
}

async function runVerify() {
  verifying.value = true
  verifyResult.value = null
  try {
    const result = (await agentPresenter.verifyApiKey(
      config.provider,
      config.apiKey,
      config.model || defaultModel(),
      config.baseUrl || undefined,
    )) as { success: boolean; error?: string; modelName?: string }
    verifyResult.value = result
  } catch {
    verifyResult.value = { success: false, error: '验证请求失败' }
  }
  verifying.value = false
}

function defaultModel(): string {
  return config.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'
}

async function complete() {
  await configStore.set('ai.provider', config.provider)
  await configStore.set('ai.apiKey', config.apiKey)
  await configStore.set('ai.model', config.model || defaultModel())
  if (config.baseUrl) await configStore.set('ai.baseUrl', config.baseUrl)
  await configStore.set('evolution.user', config.userName || 'dev')
  await configStore.set('app.onboarded', true)
  emit('done')
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

    <ProviderStep
      v-else-if="currentStep === 1"
      v-model:provider="config.provider"
      v-model:api-key="config.apiKey"
      v-model:model="config.model"
      v-model:base-url="config.baseUrl"
      @next="
        currentStep = 2;
        runVerify();
      "
      @prev="prev"
    />
    <VerifyStep
      v-else-if="currentStep === 2"
      :verifying="verifying"
      :result="verifyResult"
      :skipped="skippedVerify"
      @next="next"
      @prev="
        prev();
        verifyResult = null;
      "
      @skip="
        skippedVerify = true;
        next();
      "
      @retry="runVerify()"
    />
    <IdentityStep
      v-else-if="currentStep === 3"
      v-model:user-name="config.userName"
      @next="next"
      @prev="prev"
    />
    <CompleteStep
      v-else-if="currentStep === 4"
      :provider="config.provider"
      :model="config.model"
      :user-name="config.userName"
      :skipped-verify="skippedVerify"
      @complete="complete"
    />
  </div>
</template>
