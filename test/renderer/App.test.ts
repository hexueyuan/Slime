// test/renderer/App.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";

const mockInvoke = vi.fn(async (...args: unknown[]) => {
  const [, name, method] = args as [string, string, string];
  if (name === "workspacePresenter" && method === "needsInit") return false;
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

  it("should render title bar as drag region", async () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find(".h-9").exists()).toBe(true);
  });

  it("should render chat and function panels", async () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find("textarea").exists()).toBe(true);
    expect(wrapper.text()).toContain("在对话中开始进化");
  });

  it("should render draggable divider", async () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();
    const divider = wrapper.find(".cursor-col-resize");
    expect(divider.exists()).toBe(true);
  });
});
