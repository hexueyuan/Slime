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

// mock window.electron for agent:reset IPC
(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
};

describe("EvolutionStatusBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should always be visible even when idle", () => {
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(true);
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

  it("should always show reset button", () => {
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="reset-btn"]').exists()).toBe(true);
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

  it("should show confirm dialog when reset clicked", async () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar, {
      global: { stubs: { teleport: true } },
    });
    await wrapper.find('[data-testid="reset-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="reset-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认重置");
  });
});
