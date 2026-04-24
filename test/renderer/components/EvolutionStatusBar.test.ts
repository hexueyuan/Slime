import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useEvolutionStore } from "@/stores/evolution";
import EvolutionStatusBar from "@/components/evolution/EvolutionStatusBar.vue";

vi.mock("@/composables/usePresenter", () => ({
  usePresenter: () =>
    new Proxy(
      {},
      {
        get: () => vi.fn().mockResolvedValue(true),
      },
    ),
}));

describe("EvolutionStatusBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should be hidden when idle and no completedTag", () => {
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(false);
  });

  it("should show stepper when stage is discuss", () => {
    const store = useEvolutionStore();
    store.setStage("discuss");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("需求澄清");
    expect(wrapper.text()).toContain("执行进化");
    expect(wrapper.text()).toContain("应用变更");
  });

  it("should show discard button when in progress", () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="discard-btn"]').exists()).toBe(true);
  });

  it("should show completed state when completedTag exists", () => {
    const store = useEvolutionStore();
    store.setCompleted("egg-v0.1-dev.3", "Added feature X");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("进化完成");
    expect(wrapper.text()).toContain("egg-v0.1-dev.3");
    expect(wrapper.text()).toContain("重启以生效");
  });

  it("should show confirm dialog when discard clicked", async () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar, {
      global: { stubs: { teleport: true } },
    });
    await wrapper.find('[data-testid="discard-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="discard-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认丢弃进化");
  });
});
