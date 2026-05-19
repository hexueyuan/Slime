import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";

const invoke = vi.fn(async () => null);

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/gateway/ChannelRealtimeChart.vue", () => ({
  __esModule: true,
  default: { template: "<div />", props: ["points"] },
}));

vi.mock("@/components/ModelIcon.vue", () => ({
  __esModule: true,
  default: { template: "<span />", props: ["modelName", "size"] },
}));

import ChannelTab from "@/components/gateway/ChannelTab.vue";
import { useGatewayStore } from "@/stores/gateway";

function listModelCalls() {
  return invoke.mock.calls.filter(
    (call) => call[0] === "presenter:call" && call[2] === "listModelsByChannel",
  );
}

describe("ChannelTab first paint behavior", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    invoke.mockClear();
    invoke.mockImplementation(async () => null);
    vi.spyOn(window, "confirm").mockReset();
  });

  it("只加载首个选中供应商的模型，不为全部供应商预加载模型", async () => {
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        name: "Ch2",
        type: "anthropic",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    mount(ChannelTab, { attachTo: document.body });
    await nextTick();
    await nextTick();

    const calls = listModelCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][3]).toBe(1);
  });

  it("只在打开模型管理时展示模型管理弹窗", async () => {
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];
    store.models.set(1, [
      {
        id: 10,
        channelId: 1,
        modelName: "gpt-4o",
        type: "chat",
        capabilities: [],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const wrapper = mount(ChannelTab, { attachTo: document.body });
    await nextTick();
    await nextTick();

    expect(document.body.textContent).toContain("Ch1");
    expect(document.body.textContent).not.toContain("gpt-4o");

    await wrapper.get('[data-testid="channel-manage-models"]').trigger("click");
    await nextTick();

    expect(document.body.textContent).toContain("模型管理");
    expect(listModelCalls()).toHaveLength(2);
  });

  it("点击供应商卡片会切换选中供应商并加载对应模型", async () => {
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        name: "Ch2",
        type: "anthropic",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(ChannelTab, { attachTo: document.body });
    await nextTick();
    await nextTick();
    invoke.mockClear();

    await wrapper.findAll('[data-testid="channel-card"]')[1].trigger("click");
    await flushPromises();

    expect(listModelCalls()).toHaveLength(1);
    expect(listModelCalls()[0][3]).toBe(2);
    expect(wrapper.findAll('[data-testid="channel-card"]')[1].attributes("data-selected")).toBe(
      "true",
    );
  });

  it("取消确认时不会删除供应商", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(ChannelTab, { attachTo: document.body });
    await nextTick();
    await nextTick();

    await wrapper.get('[data-testid="channel-delete"]').trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith("确认删除供应商「Ch1」？");
    expect(invoke).not.toHaveBeenCalledWith(
      "presenter:call",
      "gatewayPresenter",
      "deleteChannel",
      1,
    );
  });

  it("确认后删除供应商并刷新列表", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    invoke.mockImplementation(async (_channel, _presenter, method) => {
      if (method === "listChannels") return [];
      return null;
    });
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrl: "",
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const wrapper = mount(ChannelTab, { attachTo: document.body });
    await nextTick();
    await nextTick();

    await wrapper.get('[data-testid="channel-delete"]').trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith("确认删除供应商「Ch1」？");
    expect(invoke).toHaveBeenCalledWith("presenter:call", "gatewayPresenter", "deleteChannel", 1);
    expect(invoke).toHaveBeenCalledWith("presenter:call", "gatewayPresenter", "listChannels");
  });
});
