<template>
  <div class="prose prose-sm dark:prose-invert w-full max-w-none">
    <NodeRenderer
      :content="debouncedContent"
      :custom-id="`slime-block-${blockId}`"
      :is-dark="true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import NodeRenderer from "markstream-vue";

const props = defineProps<{
  content: string;
  blockId: string;
}>();

const debouncedContent = ref(props.content);

const updateContent = useDebounceFn(
  (value: string) => {
    debouncedContent.value = value;
  },
  32,
  { maxWait: 64 },
);

watch(
  () => props.content,
  (value) => {
    updateContent(value);
  },
);
</script>
