import { ref, onMounted } from "vue";
import { usePresenter } from "./usePresenter";
import type { Capability, CapabilityRequirement } from "@shared/types/gateway";

export function useCapabilityCheck(requirements: CapabilityRequirement) {
  const gw = usePresenter("gatewayPresenter");
  const available = ref(false);
  const missing = ref<string[]>([]);

  async function check() {
    const result = await gw.select(requirements);
    missing.value = result.missing;
    available.value = result.missing.length === 0;
  }

  onMounted(check);

  return { available, missing, refresh: check };
}

export function useAvailableCapabilities() {
  const gw = usePresenter("gatewayPresenter");
  const capabilities = ref<Capability[]>([]);

  async function load() {
    capabilities.value = await gw.availableCapabilities();
  }

  onMounted(load);

  return { capabilities, refresh: load };
}
