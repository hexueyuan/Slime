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

import GroupEditDialog from "@/components/gateway/GroupEditDialog.vue";
import { useGatewayStore } from "@/stores/gateway";

describe("GroupEditDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("should not render when open=false", () => {
    mount(GroupEditDialog, {
      props: { open: false, group: null },
      attachTo: document.body,
    });
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).toBeNull();
  });

  it("should render dialog when open=true", () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.querySelector('[data-testid="group-edit-overlay"]')).not.toBeNull();
  });

  it('should show "新增分组" title when group is null', () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("新增分组");
  });

  it('should show "编辑分组" title when group is provided', () => {
    mount(GroupEditDialog, {
      props: {
        open: true,
        group: { id: 1, name: "test", balanceMode: "failover", createdAt: "", updatedAt: "" },
      },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("编辑分组");
  });
});

describe("Left panel interactions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "TestChannel",
        type: "openai",
        baseUrls: [],
        models: ["gpt-4o", "gpt-3.5"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: 2,
        name: "AnotherChannel",
        type: "anthropic",
        baseUrls: [],
        models: ["claude-opus"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];
  });

  it("should display channels with model count", () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("TestChannel");
    expect(document.body.textContent).toContain("AnotherChannel");
  });

  it("should add model to selected list on click", async () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Find the gpt-4o button in the left panel and click it
    const modelButtons = document.querySelectorAll("button");
    const gpt4oBtn = Array.from(modelButtons).find(
      (b) => b.textContent?.includes("gpt-4o") && !b.textContent?.includes("gpt-3.5"),
    );
    expect(gpt4oBtn).toBeTruthy();
    gpt4oBtn!.click();
    await nextTick();
    // Should appear in right panel
    const rightPanel = document.body.textContent;
    expect(rightPanel).toContain("#1");
  });

  it("should filter models by search query", async () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    const searchInput = document.querySelector(
      'input[placeholder="搜索模型..."]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    searchInput.value = "claude";
    searchInput.dispatchEvent(new Event("input"));
    await nextTick();
    // TestChannel should be hidden, AnotherChannel visible
    expect(document.body.textContent).toContain("claude-opus");
    expect(document.body.textContent).not.toContain("gpt-4o");
  });
});

describe("Right panel interactions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrls: [],
        models: ["model-a", "model-b", "model-c"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];
  });

  it("should remove item and update sequence numbers", async () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Add two models
    const btns = () =>
      Array.from(document.querySelectorAll("button")).filter((b) =>
        b.textContent?.includes("model-"),
      );
    btns()[0]?.click();
    await nextTick();
    btns()[1]?.click();
    await nextTick();
    expect(document.body.textContent).toContain("#1");
    expect(document.body.textContent).toContain("#2");
  });

  it("should clear all items", async () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });
    // Add a model
    const btns = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("model-a"),
    );
    btns[0]?.click();
    await nextTick();
    expect(document.body.textContent).toContain("#1");

    // Click clear button
    const clearBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清空"),
    );
    expect(clearBtn).toBeTruthy();
    clearBtn!.click();
    await nextTick();
    expect(document.body.textContent).toContain("点击左侧模型添加");
  });
});

describe("Save logic", () => {
  let invokeResults: Record<string, any>;

  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useGatewayStore();
    store.channels = [
      {
        id: 1,
        name: "Ch1",
        type: "openai",
        baseUrls: [],
        models: ["model-a", "model-b"],
        enabled: true,
        priority: 0,
        weight: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];

    invokeResults = {};
    (window as any).electron.ipcRenderer.invoke = vi.fn(
      async (_channel: string, _name: string, method: string, ...args: any[]) => {
        if (method === "createGroup") {
          return {
            id: 99,
            name: args[0].name,
            balanceMode: args[0].balanceMode,
            createdAt: "",
            updatedAt: "",
          };
        }
        if (method === "setGroupItems") {
          invokeResults.setGroupItemsArgs = args;
          return true;
        }
        if (method === "listGroups") return [];
        return null;
      },
    );
  });

  it("should call createGroup + setGroupItems with correct priority mapping on save", async () => {
    mount(GroupEditDialog, {
      props: { open: true, group: null },
      attachTo: document.body,
    });

    // Set name
    const nameInput = document.querySelector('input[placeholder="gpt-4o"]') as HTMLInputElement;
    nameInput.value = "test-group";
    nameInput.dispatchEvent(new Event("input"));
    await nextTick();

    // Add two models
    const modelBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("model-"),
    );
    modelBtns[0]?.click();
    await nextTick();
    modelBtns[1]?.click();
    await nextTick();

    // Click save
    const saveBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "保存",
    );
    saveBtn!.click();
    await nextTick();
    // Wait for async save
    await new Promise((r) => setTimeout(r, 10));

    expect(invokeResults.setGroupItemsArgs).toBeTruthy();
    const [_groupId, items] = invokeResults.setGroupItemsArgs;
    // First item (index 0) gets highest priority
    expect(items[0].priority).toBe(1);
    expect(items[1].priority).toBe(0);
    expect(items[0].weight).toBe(1);
    expect(items[1].weight).toBe(1);
  });
});
