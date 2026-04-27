// test/renderer/App.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";

const mockInvoke = vi.fn(async (...args: unknown[]) => {
  const [, name, method] = args as [string, string, string];
  if (name === "workspacePresenter" && method === "needsInit") return false;
  if (name === "configPresenter" && method === "get") return true;
  if (name === "agentConfigPresenter" && method === "listAgents") return [];
  if (name === "agentChatPresenter" && method === "getSessions") return [];
  return null;
});
const mockOn = vi.fn(() => vi.fn());

(window as any).electron = {
  ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() },
};

import App from "@/App.vue";

describe("App", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockOn.mockClear();
    mockInvoke.mockImplementation(async (...args: unknown[]) => {
      const [, name, method] = args as [string, string, string];
      if (name === "workspacePresenter" && method === "needsInit") return false;
      if (name === "configPresenter" && method === "get") return true;
      if (name === "agentConfigPresenter" && method === "listAgents") return [];
      if (name === "agentChatPresenter" && method === "getSessions") return [];
      return null;
    });
  });

  it("should render main layout when onboarded", async () => {
    const wrapper = mount(App, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("should render chatroom panel by default", async () => {
    const wrapper = mount(App, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="sidebar-chatroom"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
