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

vi.mock("@/components/chat/AgentAvatar.vue", () => ({
  default: {
    name: "AgentAvatar",
    props: ["avatar", "size"],
    template: '<div data-testid="agent-avatar" />',
  },
}));

import AgentSettings from "@/components/settings/AgentSettings.vue";

const AGENTS = [
  {
    id: "hal-ai",
    name: "HalAI",
    description: "内置助手",
    enabled: true,
    protected: true,
    avatar: null,
    config: {},
    type: "builtin",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "my-agent",
    name: "MyAgent",
    description: "自定义",
    enabled: true,
    protected: false,
    avatar: null,
    config: {},
    type: "custom",
    createdAt: 0,
    updatedAt: 0,
  },
];

describe("AgentSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockImplementation(async (_ch: string, _name: string, method: string) => {
      if (method === "listAgents") return AGENTS;
      return null;
    });
  });

  it("renders agent rows after fetch", async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body });
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="agent-row"]');
    expect(rows).toHaveLength(2);
  });

  it("shows 内置 badge for protected agent", async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain("内置");
  });

  it("hides delete button for protected agent", async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body });
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="agent-row"]');
    const halRow = rows[0];
    expect(halRow.find('[data-testid="delete-btn"]').exists()).toBe(false);
  });

  it("shows delete button for non-protected agent", async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body });
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="agent-row"]');
    const customRow = rows[1];
    expect(customRow.find('[data-testid="delete-btn"]').exists()).toBe(true);
  });

  it("calls deleteAgent and re-fetches on delete confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockInvoke.mockImplementation(async (_ch: string, _name: string, method: string) => {
      if (method === "listAgents") return AGENTS;
      if (method === "deleteAgent") return null;
      return null;
    });
    const wrapper = mount(AgentSettings, { attachTo: document.body });
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="agent-row"]');
    await rows[1].find('[data-testid="delete-btn"]').trigger("click");
    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "agentConfigPresenter",
      "deleteAgent",
      "my-agent",
    );
  });
});
