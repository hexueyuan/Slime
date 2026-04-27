import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();

(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

// Mock window.addEventListener/removeEventListener for resize handler in useSplitPane
vi.stubGlobal("addEventListener", vi.fn());
vi.stubGlobal("removeEventListener", vi.fn());

import App from "@/App.vue";

describe("App", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    // Default: return safe values for all IPC calls
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "recovery:check") return null;
      if (channel === "presenter:call") {
        const [presenter, method] = args;
        if (presenter === "sessionPresenter" && method === "getSessions") return [];
        if (presenter === "sessionPresenter" && method === "createSession")
          return {
            id: "test-session",
            title: "test",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        if (presenter === "sessionPresenter" && method === "getMessages") return [];
      }
      return null;
    });
  });

  it("shows OnboardingWizard when app.onboarded is falsy", async () => {
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "recovery:check") return null;
      if (channel === "presenter:call") {
        const [presenter, method, key] = args;
        if (presenter === "configPresenter" && method === "get" && key === "app.onboarded")
          return null;
        if (presenter === "sessionPresenter" && method === "getSessions") return [];
        if (presenter === "sessionPresenter" && method === "createSession")
          return { id: "s1", title: "test", createdAt: Date.now(), updatedAt: Date.now() };
        if (presenter === "sessionPresenter" && method === "getMessages") return [];
      }
      return null;
    });
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.findComponent({ name: "OnboardingWizard" }).exists()).toBe(true);
  });

  it("skips onboarding when app.onboarded is true", async () => {
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "recovery:check") return null;
      if (channel === "presenter:call") {
        const [presenter, method, key] = args;
        if (presenter === "configPresenter" && method === "get" && key === "app.onboarded")
          return true;
        if (presenter === "workspacePresenter" && method === "needsInit") return true;
        if (presenter === "sessionPresenter" && method === "getSessions") return [];
        if (presenter === "sessionPresenter" && method === "createSession")
          return { id: "s1", title: "test", createdAt: Date.now(), updatedAt: Date.now() };
        if (presenter === "sessionPresenter" && method === "getMessages") return [];
      }
      return null;
    });
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.findComponent({ name: "OnboardingWizard" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "WorkspaceSetup" }).exists()).toBe(true);
  });
});
