import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ModelManagerDialog from "@/components/gateway/ModelManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, Model } from "@shared/types/gateway";

const channelModels = new Map<number, Model[]>();

const invoke = vi.fn(async (_channel: string, _presenter: string, method: string, ...args) => {
  if (method === "listModelsByChannel") {
    return channelModels.get(args[0] as number) ?? [];
  }
  return null;
});

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@/components/ModelIcon.vue", () => ({
  __esModule: true,
  default: { template: "<span />", props: ["modelName", "size"] },
}));

const channel: Channel = {
  id: 1,
  name: "百度OneApi",
  type: "anthropic",
  baseUrl: "",
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

const nextChannel: Channel = {
  id: 2,
  name: "备用OneApi",
  type: "anthropic",
  baseUrl: "",
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

const model: Model = {
  id: 10,
  channelId: 1,
  modelName: "Claude Sonnet 4.6",
  type: "chat",
  capabilities: ["tool_call"],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("ModelManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoke.mockClear();
    invoke.mockImplementation(
      async (_channel: string, _presenter: string, method: string, ...args) => {
        if (method === "listModelsByChannel") {
          return channelModels.get(args[0] as number) ?? [];
        }
        return null;
      },
    );
    channelModels.clear();
    document.body.innerHTML = "";
  });

  it("renders models for a channel and routes card events to presenter calls", async () => {
    const store = useGatewayStore();
    store.models.set(channel.id, [model]);
    channelModels.set(channel.id, [model]);

    const wrapper = mount(ModelManagerDialog, {
      props: { open: true, channel },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("模型管理");
    expect(document.body.textContent).toContain("Claude Sonnet 4.6");

    await wrapper.get('[data-testid="model-cap-vision"]').trigger("click");
    await wrapper.get('[data-testid="model-toggle-enabled"]').trigger("click");

    const updateCalls = invoke.mock.calls.filter(
      (call) => call[0] === "presenter:call" && call[2] === "updateModel",
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]).toMatchObject([
      "presenter:call",
      "gatewayPresenter",
      "updateModel",
      model.id,
      { capabilities: ["tool_call", "vision"] },
    ]);
    expect(updateCalls[1]).toMatchObject([
      "presenter:call",
      "gatewayPresenter",
      "updateModel",
      model.id,
      { enabled: false },
    ]);
  });

  it("emits close from the dialog shell", async () => {
    const wrapper = mount(ModelManagerDialog, {
      props: { open: true, channel },
      attachTo: document.body,
    });

    await wrapper.get('[data-testid="manager-close"]').trigger("click");

    expect(wrapper.emitted("close")).toEqual([[]]);
  });

  it("keeps refresh model creation pinned to the channel active at click time", async () => {
    const store = useGatewayStore();
    store.models.set(channel.id, []);
    store.models.set(nextChannel.id, []);
    channelModels.set(channel.id, []);
    channelModels.set(nextChannel.id, []);

    let resolveFetch: (models: string[]) => void = () => {};
    invoke.mockImplementation(
      async (_channel: string, _presenter: string, method: string, ...args) => {
        if (method === "listModelsByChannel") {
          return channelModels.get(args[0] as number) ?? [];
        }
        if (method === "fetchModels") {
          return new Promise<string[]>((resolve) => {
            resolveFetch = resolve;
          });
        }
        return null;
      },
    );

    const wrapper = mount(ModelManagerDialog, {
      props: { open: true, channel },
      attachTo: document.body,
    });

    await wrapper.get('button[title="刷新模型"]').trigger("click");
    await wrapper.setProps({ channel: nextChannel });

    resolveFetch(["Fresh Snapshot Model"]);
    await flushPromises();

    const createModelCall = invoke.mock.calls.find(
      (call) => call[0] === "presenter:call" && call[2] === "createModel",
    );
    expect(createModelCall).toMatchObject([
      "presenter:call",
      "gatewayPresenter",
      "createModel",
      {
        channelId: channel.id,
        modelName: "Fresh Snapshot Model",
        type: "chat",
        capabilities: [],
        enabled: true,
      },
    ]);
  });
});
