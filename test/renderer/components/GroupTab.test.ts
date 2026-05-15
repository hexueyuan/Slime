import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

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
  it("should list existing groups", () => {
    const store = useGatewayStore();
    store.groups = [
      { id: 1, name: "cc-auto", balanceMode: "failover", createdAt: "", updatedAt: "" },
    ];
    mount(GroupTab, { attachTo: document.body });
    expect(document.body.textContent).toContain("cc-auto");
    expect(document.body.textContent).toContain("failover");
  });
});
