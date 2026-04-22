import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

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

import ChatPanel from "@/components/chat/ChatPanel.vue";

describe("ChatPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render chat panel with input", () => {
    const wrapper = mount(ChatPanel);
    expect(wrapper.find("textarea").exists()).toBe(true);
  });

  it("should have flex column layout", () => {
    const wrapper = mount(ChatPanel);
    expect(wrapper.find(".flex.flex-col.h-full").exists()).toBe(true);
  });
});
