// test/renderer/App.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";

const mockInvoke = vi.fn(async (...args: unknown[]) => {
  const method = args[2];
  if (method === "createSession") return { id: "s1", title: "新对话", createdAt: 1, updatedAt: 1 };
  return [];
});
const mockOn = vi.fn(() => vi.fn());

(window as any).electron = {
  ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() },
};

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import EvolutionCenter from "@/views/EvolutionCenter.vue";

// Mock window.addEventListener/removeEventListener for resize handler in useSplitPane
vi.stubGlobal("addEventListener", vi.fn());
vi.stubGlobal("removeEventListener", vi.fn());

describe("EvolutionCenter", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockOn.mockClear();
  });

  it("should render title bar as drag region", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.find(".h-9").exists()).toBe(true);
  });

  it("should render chat and function panels", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.find("textarea").exists()).toBe(true);
    expect(wrapper.text()).toContain("工作区");
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
