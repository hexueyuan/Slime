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

import EvolutionCenter from "@/views/EvolutionCenter.vue";

describe("EvolutionCenter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "recovery:check") return null;
      if (channel === "presenter:call") {
        const [presenter, method, key] = args;
        if (presenter === "configPresenter" && method === "get" && key === "app.onboarded")
          return true;
        if (presenter === "workspacePresenter" && method === "needsInit") return false;
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

  it("renders sidebar and main layout", async () => {
    const wrapper = mount(EvolutionCenter);
    await flushPromises();
    expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);
  });
});
