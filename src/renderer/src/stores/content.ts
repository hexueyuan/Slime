import { defineStore } from "pinia";
import { ref } from "vue";
import type { FunctionContent } from "@shared/types/content";
import { CONTENT_EVENTS } from "@shared/events";

export const useContentStore = defineStore("content", () => {
  const content = ref<FunctionContent | null>(null);

  function setContent(c: FunctionContent): void {
    content.value = c;
  }

  function clear(): void {
    content.value = null;
  }

  return { content, setContent, clear };
});

export function setupContentIpc(store: ReturnType<typeof useContentStore>): () => void {
  const unsubs: Array<() => void> = [];

  const unsubUpdated = window.electron.ipcRenderer.on(
    CONTENT_EVENTS.UPDATED,
    (_sessionId: unknown, data: unknown) => {
      store.setContent(data as FunctionContent);
    },
  );
  unsubs.push(unsubUpdated);

  const unsubCleared = window.electron.ipcRenderer.on(CONTENT_EVENTS.CLEARED, () => {
    store.clear();
  });
  unsubs.push(unsubCleared);

  return () => unsubs.forEach((fn) => fn());
}
