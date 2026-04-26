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

  it("should show empty state when no groups", () => {
    mount(GroupTab, { attachTo: document.body });
    expect(document.body.textContent).toContain("暂无分组");
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

  it('should open GroupEditDialog on "+ 新增分组" click', async () => {
    mount(GroupTab, { attachTo: document.body });
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("新增分组"),
    );
    btn!.click();
    await nextTick();
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).not.toBeNull();
  });
});
