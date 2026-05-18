import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import GroupManagerDialog from "@/components/gateway/GroupManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(async () => null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/gateway/GroupEditDialog.vue", () => ({
  __esModule: true,
  default: { template: "<div data-testid='group-edit-dialog' />", props: ["open", "group"] },
}));

describe("GroupManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("renders group cards and opens edit dialog", async () => {
    const store = useGatewayStore();
    store.groups = [
      {
        id: 1,
        name: "claude",
        balanceMode: "failover",
        isBuiltin: false,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(GroupManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("分组管理");
    expect(document.body.textContent).toContain("claude");

    await wrapper.get('[data-testid="group-edit"]').trigger("click");

    expect(wrapper.find('[data-testid="group-edit-dialog"]').exists()).toBe(true);
  });
});
