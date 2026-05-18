import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ApiKeyManagerDialog from "@/components/gateway/ApiKeyManagerDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

const invoke = vi.fn(async (_channel: string, _presenter: string, method: string) => {
  if (method === "createApiKey") {
    return {
      id: 2,
      name: "web-client",
      key: "sk-new-secret",
      enabled: true,
      isInternal: false,
      createdAt: "",
    };
  }

  if (method === "listApiKeys") {
    return [
      {
        id: 1,
        name: "internal",
        key: "sk-internal-secret",
        enabled: true,
        isInternal: true,
        createdAt: "",
      },
      {
        id: 2,
        name: "web-client",
        key: "sk-new-secret",
        enabled: true,
        isInternal: false,
        createdAt: "",
      },
    ];
  }

  return undefined;
});

(window as any).electron = {
  ipcRenderer: {
    invoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

Object.assign(navigator, {
  clipboard: { writeText: vi.fn(async () => undefined) },
});

describe("ApiKeyManagerDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoke.mockClear();
    document.body.innerHTML = "";
  });

  it("renders key cards and creates a revealed key", async () => {
    const store = useGatewayStore();
    store.apiKeys = [
      {
        id: 1,
        name: "internal",
        key: "sk-internal-secret",
        enabled: true,
        isInternal: true,
        createdAt: "",
      },
    ];

    const wrapper = mount(ApiKeyManagerDialog, {
      props: { open: true },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("密钥管理");
    expect(document.body.textContent).toContain("internal");

    await wrapper.get('[data-testid="open-key-create"]').trigger("click");
    await wrapper.get('[data-testid="key-name-input"]').setValue("web-client");
    await wrapper.get('[data-testid="create-key-submit"]').trigger("click");
    await flushPromises();

    expect(invoke.mock.calls.some((call) => call[2] === "createApiKey")).toBe(true);
    expect(document.body.textContent).toContain("sk-new-secret");
  });
});
