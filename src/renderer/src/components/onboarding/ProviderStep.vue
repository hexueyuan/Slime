<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  provider: 'anthropic' | 'openai'
  apiKey: string
  model: string
  baseUrl: string
}>()

const emit = defineEmits<{
  'update:provider': [value: 'anthropic' | 'openai']
  'update:apiKey': [value: string]
  'update:model': [value: string]
  'update:baseUrl': [value: string]
  next: []
  prev: []
}>()

const canNext = computed(() => props.apiKey.trim().length > 0)
</script>

<template>
  <div data-testid="provider-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <h2 class="text-[17px] font-semibold text-slate-200">配置 AI 服务</h2>
    <p class="text-sm text-slate-400">Slime 需要一个 AI 引擎来实现自我进化。</p>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">Provider</label>
      <select
        data-testid="onboard-provider"
        :value="provider"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-500/50"
        @change="emit('update:provider', ($event.target as HTMLSelectElement).value as any)"
      >
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI Compatible</option>
      </select>
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">API Key</label>
      <input
        data-testid="onboard-api-key"
        type="password"
        :value="apiKey"
        placeholder="sk-ant-api03-xxxxx..."
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
      />
      <a
        href="https://console.anthropic.com"
        target="_blank"
        class="text-[11px] text-violet-400 no-underline"
        >→ 获取 Anthropic API Key</a
      >
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">Model</label>
      <input
        data-testid="onboard-model"
        type="text"
        :value="model"
        :placeholder="provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:model', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400"
        >Base URL <span class="text-slate-600">(可选)</span></label
      >
      <input
        data-testid="onboard-base-url"
        type="text"
        :value="baseUrl"
        placeholder="https://api.anthropic.com"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:baseUrl', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        ← 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canNext"
        @click="emit('next')"
      >
        验证连接 →
      </button>
    </div>
  </div>
</template>
