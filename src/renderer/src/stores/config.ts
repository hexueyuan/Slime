import { defineStore } from "pinia";
import { reactive } from "vue";
import { usePresenter } from "@/composables/usePresenter";

export const useConfigStore = defineStore("config", () => {
  const cache = reactive<Record<string, unknown>>({});
  const configPresenter = usePresenter("configPresenter");

  async function get(key: string): Promise<unknown> {
    const value = await configPresenter.get(key);
    cache[key] = value;
    return value;
  }

  async function set(key: string, value: unknown): Promise<boolean> {
    const result = (await configPresenter.set(key, value)) as boolean;
    if (result) {
      cache[key] = value;
    }
    return result;
  }

  return {
    cache,
    get,
    set,
  };
});
