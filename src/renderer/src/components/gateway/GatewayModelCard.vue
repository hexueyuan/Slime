<script setup lang="ts">
import { Icon } from "@iconify/vue";
import ModelIcon from "@/components/ModelIcon.vue";
import type { Capability, Model } from "@shared/types/gateway";

const ALL_CAPS: { key: Capability; label: string; icon: string }[] = [
  { key: "reasoning", label: "reasoning", icon: "lucide:brain" },
  { key: "vision", label: "vision", icon: "lucide:eye" },
  { key: "image_gen", label: "image_gen", icon: "lucide:image" },
  { key: "tool_call", label: "tool_call", icon: "lucide:wrench" },
];

const props = withDefaults(
  defineProps<{
    model: Model;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  "toggle-capability": [model: Model, capability: Capability];
  "toggle-enabled": [model: Model];
  delete: [model: Model];
}>();

function hasCapability(capability: Capability) {
  return props.model.capabilities.includes(capability);
}

function emitToggleCapability(capability: Capability) {
  emit("toggle-capability", props.model, capability);
}

function emitToggleEnabled() {
  emit("toggle-enabled", props.model);
}

function emitDelete() {
  if (props.disabled) return;
  emit("delete", props.model);
}
</script>

<template>
  <article
    :class="[
      'min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3 transition-colors',
      'hover:border-[var(--color-border-strong)]',
      disabled && 'opacity-70',
    ]"
  >
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-2.5">
        <ModelIcon :model-name="model.modelName" :size="28" />
        <div class="min-w-0 space-y-1">
          <h3 class="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
            {{ model.modelName }}
          </h3>
          <div class="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span class="truncate">{{ model.type }}</span>
            <span class="h-1 w-1 rounded-full bg-[var(--color-border-strong)]" />
            <span>{{ model.enabled ? "enabled" : "disabled" }}</span>
          </div>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          data-testid="model-toggle-enabled"
          title="Toggle model enabled"
          :aria-pressed="model.enabled"
          :disabled="disabled"
          :class="[
            'relative h-6 w-10 rounded-full border transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            model.enabled
              ? 'border-[var(--color-accent-brand)] bg-[var(--color-accent-brand-soft)]'
              : 'border-[var(--color-border-subtle)] bg-[var(--color-control)]',
          ]"
          @click="emitToggleEnabled"
        >
          <span
            :class="[
              'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-transform',
              model.enabled
                ? 'translate-x-[18px] bg-[var(--color-accent-brand)]'
                : 'translate-x-1 bg-[var(--color-text-disabled)]',
            ]"
          />
        </button>
        <button
          type="button"
          data-testid="model-delete"
          title="Delete model"
          aria-label="Delete model"
          :disabled="disabled"
          :class="[
            'inline-grid h-6 w-6 place-items-center rounded-md border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors',
            'hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-danger)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
            'disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:hover:border-transparent disabled:hover:bg-transparent',
          ]"
          @click="emitDelete"
        >
          <Icon icon="lucide:trash-2" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div class="mt-3 flex min-w-0 flex-wrap gap-1.5">
      <button
        v-for="cap in ALL_CAPS"
        :key="cap.key"
        type="button"
        :data-testid="`model-cap-${cap.key}`"
        :disabled="disabled"
        :aria-pressed="hasCapability(cap.key)"
        :class="[
          'inline-flex h-6 min-w-0 items-center gap-1 rounded-[var(--radius-xs)] border px-2 text-[11px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
          'disabled:cursor-not-allowed disabled:opacity-60',
          hasCapability(cap.key)
            ? 'border-[var(--color-accent-brand)] bg-[var(--color-accent-brand-soft)] text-[var(--color-text-primary)]'
            : 'border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]',
        ]"
        @click="emitToggleCapability(cap.key)"
      >
        <Icon :icon="cap.icon" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ cap.label }}</span>
      </button>
    </div>
  </article>
</template>
