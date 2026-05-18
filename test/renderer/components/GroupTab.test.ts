import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
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
  });

  it("shows group summary and opens manager dialog", async () => {
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
    ];

    const wrapper = mount(GroupTab, { attachTo: document.body });

    expect(document.body.textContent).toContain("分组");
    expect(document.body.textContent).toContain("1");

    await wrapper.get('[data-testid="open-group-manager"]').trigger("click");

    expect(document.body.textContent).toContain("分组管理");
  });
});
