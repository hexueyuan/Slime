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
});
