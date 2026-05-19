import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import GroupManagerDialog from "@/components/gateway/GroupManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";
import type { Group } from "@shared/types/gateway";

const invokeMock = vi.fn(async () => null);

(window as any).electron = {
  ipcRenderer: {
    invoke: invokeMock,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/gateway/GroupEditDialog.vue", () => ({
  __esModule: true,
  default: {
    template:
      "<div v-if='open' data-testid='group-edit-dialog'>{{ group?.name || 'new group' }}</div>",
    props: ["open", "group"],
  },
}));

describe("GroupManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
    vi.spyOn(window, "confirm").mockReset();
    document.body.innerHTML = "";
  });

  const group: Group = {
    id: 1,
    name: "claude",
    balanceMode: "failover",
    isBuiltin: false,
    createdAt: "",
    updatedAt: "",
  };

  it("renders group cards and opens edit dialog", async () => {
    const store = useGatewayStore();
    store.groups = [group];
    store.channels = [
      {
        id: 7,
        name: "百度OneApi",
        type: "anthropic",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];
    invokeMock.mockImplementation(async (_channel, _presenter, method) => {
      if (method === "listGroupItems") {
        return [
          {
            id: 10,
            groupId: group.id,
            channelId: 7,
            modelName: "claude-sonnet",
            priority: 1,
            weight: 1,
          },
        ];
      }
      return null;
    });

    const wrapper = mount(GroupManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });
    await flushPromises();

    expect(document.body.textContent).toContain("分组管理");
    expect(document.body.textContent).toContain("claude");
    expect(document.body.textContent).toContain("1 渠道");
    expect(document.body.textContent).toContain("百度OneApi / claude-sonnet");
    expect(wrapper.find('[data-testid="group-edit-dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="group-edit"]').trigger("click");

    expect(wrapper.find('[data-testid="group-edit-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="group-edit-dialog"]').text()).toContain("claude");
  });

  it("does not delete a group when confirmation is canceled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const store = useGatewayStore();
    store.groups = [group];

    const wrapper = mount(GroupManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    await wrapper.get('[data-testid="group-delete"]').trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith("确认删除分组「claude」？");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "presenter:call",
      "gatewayPresenter",
      "deleteGroup",
      1,
    );
  });

  it("deletes a group and reloads groups when confirmation is accepted", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    invokeMock.mockImplementation(async (_channel, _presenter, method) => {
      if (method === "listGroups") return [];
      return null;
    });
    const store = useGatewayStore();
    store.groups = [group];

    const wrapper = mount(GroupManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    await wrapper.get('[data-testid="group-delete"]').trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith("确认删除分组「claude」？");
    expect(invokeMock).toHaveBeenCalledWith("presenter:call", "gatewayPresenter", "deleteGroup", 1);
    expect(invokeMock).toHaveBeenCalledWith("presenter:call", "gatewayPresenter", "listGroups");
  });
});
