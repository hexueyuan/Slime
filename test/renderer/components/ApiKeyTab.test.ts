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

vi.mock("@/components/gateway/ApiKeyManagerDialog.vue", () => ({
  __esModule: true,
  default: {
    template: "<div v-if='open'>密钥管理</div>",
    props: ["open"],
  },
}));

import ApiKeyTab from "@/components/gateway/ApiKeyTab.vue";
import { useGatewayStore } from "@/stores/gateway";

describe("ApiKeyTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("shows one card per api key and opens manager dialog", async () => {
    const store = useGatewayStore();
    store.apiKeys = [
      {
        id: 1,
        name: "web-client",
        key: "sk-1234567890abcdef",
        enabled: true,
        isInternal: false,
        createdAt: "",
      },
      {
        id: 2,
        name: "internal",
        key: "sk-internal",
        enabled: false,
        isInternal: true,
        createdAt: "",
      },
    ];

    const wrapper = mount(ApiKeyTab, { attachTo: document.body });

    expect(wrapper.findAll('[data-testid="api-key-resource-card"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="slime-resource-card"]')).toHaveLength(2);
    expect(
      wrapper
        .findAll('[data-testid="slime-resource-card"]')
        .every((card) => card.attributes("data-resource-kind") === "key"),
    ).toBe(true);
    expect(document.body.textContent).toContain("web-client");
    expect(document.body.textContent).toContain("internal");
    expect(document.body.textContent).not.toContain("启用 1");

    await wrapper.get('[data-testid="open-key-manager"]').trigger("click");

    expect(document.body.textContent).toContain("密钥管理");
  });
});
