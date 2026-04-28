import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import ChatFunctionPanel from "@/components/chat/ChatFunctionPanel.vue";

describe("ChatFunctionPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows tool panel when activeTab is tools", () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    expect(wrapper.text()).toContain("暂无工具调用");
  });

  it("shows preview panel when activeTab is preview", () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: "preview", toolCallBlocks: [] },
    });
    expect(wrapper.text()).toContain("暂无预览内容");
  });

  it("emits update:activeTab when preview tab clicked", async () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    await wrapper.find('[data-testid="chat-tab-preview"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")?.[0]).toEqual(["preview"]);
  });

  it("emits update:activeTab when tools tab clicked", async () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: "preview", toolCallBlocks: [] },
    });
    await wrapper.find('[data-testid="chat-tab-tools"]').trigger("click");
    expect(wrapper.emitted("update:activeTab")?.[0]).toEqual(["tools"]);
  });

  it("has no history tab", () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: "tools", toolCallBlocks: [] },
    });
    expect(wrapper.find('[data-testid="chat-tab-history"]').exists()).toBe(false);
  });
});
