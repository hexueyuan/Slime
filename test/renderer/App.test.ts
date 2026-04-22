// test/renderer/App.test.ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import EvolutionCenter from "@/views/EvolutionCenter.vue";

// Mock window.addEventListener/removeEventListener for resize handler in useSplitPane
vi.stubGlobal("addEventListener", vi.fn());
vi.stubGlobal("removeEventListener", vi.fn());

describe("EvolutionCenter", () => {
  it("should render title bar with main title and subtitle", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain("进化中心");
    expect(wrapper.text()).toContain("Slime egg v0.1");
  });

  it("should render chat and function panels", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain("对话区");
    expect(wrapper.text()).toContain("功能区");
  });

  it("should render draggable divider", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    const divider = wrapper.find(".cursor-col-resize");
    expect(divider.exists()).toBe(true);
  });
});
