import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const invoke = vi.fn(async () => null);

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

import GroupTab from "@/components/gateway/GroupTab.vue";
import { useGatewayStore } from "@/stores/gateway";

describe("GroupTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    invoke.mockReset();
    invoke.mockImplementation(async () => null);
  });

  it("shows one card per group and opens manager dialog", async () => {
    invoke.mockImplementation(async (_channel, _presenter, method, groupId) => {
      if (method === "listGroupItems") {
        return groupId === 1
          ? [{ id: 1, groupId: 1, channelId: 10, modelName: "claude", priority: 1, weight: 1 }]
          : [];
      }
      return null;
    });

    const store = useGatewayStore();
    store.groups = [
      {
        id: 1,
        name: "cc-auto",
        balanceMode: "failover",
        isBuiltin: false,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        name: "default",
        balanceMode: "round_robin",
        isBuiltin: true,
        createdAt: "",
        updatedAt: "",
      },
    ];
    store.channels = [
      {
        id: 10,
        name: "Claude",
        type: "anthropic",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(GroupTab, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="group-route-card"]')).toHaveLength(2);
    expect(document.body.textContent).toContain("cc-auto");
    expect(document.body.textContent).toContain("default");
    expect(document.body.textContent).not.toContain("自定义");

    await wrapper.get('[data-testid="open-group-manager"]').trigger("click");

    expect(document.body.textContent).toContain("分组管理");
  });
});
