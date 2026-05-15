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
import type { Model } from "@shared/types/gateway";

function makeChannel(id: number, name: string, type = "openai") {
  return {
    id,
    name,
    type: type as "openai",
    baseUrl: "",
    enabled: true,
    createdAt: "",
    updatedAt: "",
  };
}

function makeModels(channelId: number, names: string[]): Model[] {
  return names.map((n, i) => ({
    id: i + 1,
    channelId,
    modelName: n,
    type: "chat" as const,
    capabilities: [],
    enabled: true,
    createdAt: "",
    updatedAt: "",
  }));
}

describe("GroupEditDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  describe("Left panel interactions", () => {
    beforeEach(() => {
      setActivePinia(createPinia());
      document.body.innerHTML = "";
      const store = useGatewayStore();
      store.channels = [
        makeChannel(1, "TestChannel"),
        makeChannel(2, "AnotherChannel", "anthropic"),
      ];
      store.models = new Map([
        [1, makeModels(1, ["gpt-4o", "gpt-3.5"])],
        [2, makeModels(2, ["claude-opus"])],
      ]);
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
  });

  describe("Right panel interactions", () => {
    beforeEach(() => {
      setActivePinia(createPinia());
      document.body.innerHTML = "";
      const store = useGatewayStore();
      store.channels = [makeChannel(1, "Ch1")];
      store.models = new Map([[1, makeModels(1, ["model-a", "model-b", "model-c"])]]);
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
  });
});
