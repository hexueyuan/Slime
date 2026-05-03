import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();
(window as any).electron = {
  ipcRenderer: { invoke: mockInvoke, on: vi.fn(() => vi.fn()) },
};

vi.mock("@iconify/vue", () => ({ Icon: { template: "<span />" } }));

import SessionList from "@/components/chat/SessionList.vue";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentStore } from "@/stores/agent";

const NOW = 1000000000000;
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_MS = 3 * DAY_MS;

function makeSession(
  overrides: Partial<{
    id: string;
    updatedAt: number;
    isPinned: boolean;
    agentId: string;
    title: string;
  }>,
) {
  return {
    id: "s1",
    agentId: "a1",
    title: "Test Session",
    isPinned: false,
    sessionKind: "regular" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("SessionList - archive", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("no archived section when all sessions are active", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - DAY_MS })] as any;
    const agentStore = useAgentStore();
    agentStore.agents = [
      {
        id: "a1",
        name: "Bot",
        type: "builtin",
        enabled: true,
        protected: false,
        config: {} as any,
        avatar: null,
      },
    ] as any;

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archive-header"]').exists()).toBe(false);
  });

  it("archived section appears when there are archived sessions", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archive-header"]').exists()).toBe(true);
  });

  it("archived section is collapsed by default", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(false);
  });

  it("clicking archive header expands the archived section", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(true);
  });

  it("clicking archive header again collapses the archived section", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(false);
  });

  it("auto-expands archive when active session is archived", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;
    store.activeSessionId = "s1";

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(true);
  });

  it("archived sessions do not show pin menu item", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })] as any;

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    const item = wrapper.find('[data-testid="archived-session-list"] [data-testid="session-item"]');
    await item.trigger("contextmenu");
    expect(wrapper.find('[data-testid="pin-menu-item"]').exists()).toBe(false);
  });
});
