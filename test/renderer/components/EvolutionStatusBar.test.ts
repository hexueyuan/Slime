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
    expect(wrapper.text()).toContain("选择进化方向");
    expect(wrapper.text()).toContain("进化中");
    expect(wrapper.text()).toContain("进化完成");
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

  it("should show dormant (pending) state when idle without completedTag", () => {
    const store = useEvolutionStore();
    // store defaults: idle, completedTag = null
    const wrapper = mount(EvolutionStatusBar);
    const bar = wrapper.find('[data-testid="evolution-status-bar"]');
    const nodes = bar.findAll('[data-testid="stage-node"]');
    expect(nodes.length).toBe(3);
    nodes.forEach((node) => {
      expect(node.classes()).not.toContain("stage-completed");
      expect(node.classes()).not.toContain("stage-active");
    });
  });

  it("should reset to dormant state after confirm reset", async () => {
    const store = useEvolutionStore();
    store.setCompleted("egg-v0.1-dev.3", "Added feature X");
    const wrapper = mount(EvolutionStatusBar, {
      global: { stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain("进化完成");

    await wrapper.find('[data-testid="reset-btn"]').trigger("click");
    await wrapper.find('[data-testid="reset-dialog"]').find("button:last-child").trigger("click");
    await flushPromises();

    expect(store.completedTag).toBeNull();
    expect(store.stage).toBe("idle");
    expect(wrapper.text()).not.toContain("egg-v0.1-dev.3");

    const nodes = wrapper.findAll('[data-testid="stage-node"]');
    nodes.forEach((node) => {
      expect(node.classes()).not.toContain("stage-completed");
    });
  });

  it("should show active membrane rings when stage is coding", () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar);
    const nodes = wrapper.findAll('[data-testid="stage-node"]');

    // discuss(idx=0) should be completed
    expect(nodes[0].classes()).toContain("stage-completed");
    // coding(idx=1) should be active
    expect(nodes[1].classes()).toContain("stage-active");
    // applying(idx=2) should be dormant (pending)
    expect(nodes[2].classes()).toContain("stage-dormant");
  });

  it("should show completed membrane for all stages when idle with completedTag", () => {
    const store = useEvolutionStore();
    store.setCompleted("egg-v0.1-dev.5", "Improved X");
    const wrapper = mount(EvolutionStatusBar);
    const nodes = wrapper.findAll('[data-testid="stage-node"]');

    nodes.forEach((node) => {
      expect(node.classes()).toContain("stage-completed");
    });
  });
});
