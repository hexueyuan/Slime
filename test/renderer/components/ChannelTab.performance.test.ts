import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
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

describe("ChannelTab first paint behavior", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    invoke.mockClear();
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

    const listModelCalls = invoke.mock.calls.filter(
      (call) => call[0] === "presenter:call" && call[2] === "listModelsByChannel",
    );
    expect(listModelCalls).toHaveLength(1);
    expect(listModelCalls[0][3]).toBe(1);
  });
});
