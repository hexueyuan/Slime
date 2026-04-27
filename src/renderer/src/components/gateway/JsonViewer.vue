<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps<{ data: unknown; depth?: number }>();
const depth = computed(() => props.depth ?? 0);

const collapsed = ref(depth.value > 1);

function toggle() {
  collapsed.value = !collapsed.value;
}

type NodeType = "object" | "array" | "string" | "number" | "boolean" | "null";

function getType(val: unknown): NodeType {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val as NodeType;
}

const type = computed(() => getType(props.data));
const isExpandable = computed(() => type.value === "object" || type.value === "array");
const entries = computed(() => {
  if (type.value === "object") return Object.entries(props.data as Record<string, unknown>);
  if (type.value === "array")
    return (props.data as unknown[]).map((v, i) => [String(i), v] as [string, unknown]);
  return [];
});
const isEmpty = computed(() => entries.value.length === 0);

function valueClass(t: NodeType): string {
  switch (t) {
    case "string":
      return "text-green-400";
    case "number":
      return "text-blue-400";
    case "boolean":
      return "text-yellow-400";
    case "null":
      return "text-neutral-500";
    default:
      return "text-foreground";
  }
}

function displayValue(val: unknown): string {
  if (val === null) return "null";
  if (typeof val === "string") return `"${val}"`;
  return String(val);
}
</script>

<template>
  <!-- Primitive -->
  <span v-if="!isExpandable" :class="valueClass(type)">{{ displayValue(data) }}</span>

  <!-- Empty object/array -->
  <span v-else-if="isEmpty" class="text-muted-foreground">
    {{ type === "array" ? "[]" : "{}" }}
  </span>

  <!-- Expandable -->
  <span v-else>
    <button class="inline-flex items-center gap-0.5 rounded hover:bg-white/10" @click.stop="toggle">
      <Icon
        :icon="collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'"
        class="h-3 w-3 text-muted-foreground"
      />
      <span class="text-muted-foreground">
        {{ type === "array" ? "[" : "{" }}
      </span>
      <span v-if="collapsed" class="text-muted-foreground/60 text-xs">
        {{ entries.length }} {{ type === "array" ? "items" : "keys" }}
      </span>
      <span v-if="collapsed" class="text-muted-foreground">
        {{ type === "array" ? "]" : "}" }}
      </span>
    </button>

    <span v-if="!collapsed">
      <div v-for="([key, val], idx) in entries" :key="key" class="ml-4">
        <span v-if="type === 'object'" class="text-violet-400">"{{ key }}"</span>
        <span v-else class="text-muted-foreground">{{ key }}</span>
        <span class="text-muted-foreground">: </span>
        <JsonViewer :data="val" :depth="depth + 1" />
        <span v-if="idx < entries.length - 1" class="text-muted-foreground">,</span>
      </div>
      <div>
        <span class="text-muted-foreground">{{ type === "array" ? "]" : "}" }}</span>
      </div>
    </span>
  </span>
</template>
