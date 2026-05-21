<script setup lang="ts">
import { computed } from "vue";
import SlimeResourceCard from "@/components/slime/SlimeResourceCard.vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import type { GatewayApiKey } from "@shared/types/gateway";

const props = withDefaults(
  defineProps<{
    apiKey: GatewayApiKey;
    revealedKey?: string | null;
    copied?: boolean;
    actions?: boolean;
  }>(),
  {
    revealedKey: null,
    copied: false,
    actions: true,
  },
);

const emit = defineEmits<{
  copy: [apiKey: GatewayApiKey];
  "toggle-enabled": [apiKey: GatewayApiKey];
  delete: [apiKey: GatewayApiKey];
}>();

const displayKey = computed(() =>
  props.revealedKey != null ? props.revealedKey : maskKey(props.apiKey.key),
);

function maskKey(key: string) {
  let candidate: string;

  if (key.length === 0) {
    candidate = "...";
  } else if (key.length <= 4) {
    candidate = "...";
  } else if (key.length <= 8) {
    candidate = `${key.slice(0, 2)}...`;
  } else {
    candidate = `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  return candidate === key ? "********" : candidate;
}

function emitCopy() {
  emit("copy", props.apiKey);
}

function emitToggleEnabled() {
  emit("toggle-enabled", props.apiKey);
}

function emitDelete() {
  emit("delete", props.apiKey);
}

const badges = computed(() => [
  {
    label: props.apiKey.enabled ? "启用" : "停用",
    variant: props.apiKey.enabled ? ("success" as const) : ("neutral" as const),
  },
  ...(props.apiKey.isInternal
    ? [
        {
          label: "internal",
          variant: "neutral" as const,
        },
      ]
    : []),
]);

const stats = computed(() => [
  { label: "状态", value: props.apiKey.enabled ? "启用" : "停用" },
  { label: "类型", value: props.apiKey.isInternal ? "internal" : "访问密钥" },
]);
</script>

<template>
  <SlimeResourceCard
    kind="key"
    eyebrow="API Key"
    :title="apiKey.name"
    :subtitle="displayKey"
    :badges="badges"
    :stats="stats"
    detail-label="Key"
    :detail-value="displayKey"
    :class="!apiKey.enabled && 'opacity-70'"
  >
    <template v-if="actions" #actions>
      <div class="flex shrink-0 items-center gap-1">
        <SlimeIconButton
          data-testid="key-copy"
          :icon="copied ? 'lucide:check' : 'lucide:copy'"
          title="复制密钥"
          size="sm"
          @click="emitCopy"
        />
        <SlimeIconButton
          data-testid="key-toggle-enabled"
          :icon="apiKey.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'"
          title="切换密钥状态"
          size="sm"
          :aria-pressed="apiKey.enabled"
          @click="emitToggleEnabled"
        />
        <SlimeIconButton
          v-if="!apiKey.isInternal"
          data-testid="key-delete"
          icon="lucide:trash-2"
          title="删除密钥"
          size="sm"
          variant="danger"
          @click="emitDelete"
        />
      </div>
    </template>
  </SlimeResourceCard>
</template>
