import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayModelCard from "@/components/gateway/GatewayModelCard.vue";
import type { Model } from "@shared/types/gateway";

const model: Model = {
  id: 10,
  channelId: 1,
  modelName: "Claude Sonnet 4.6",
  type: "chat",
  capabilities: ["reasoning", "tool_call"],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayModelCard", () => {
  it("renders model capabilities and emits management actions", async () => {
    const wrapper = mount(GatewayModelCard, { props: { model } });

    expect(wrapper.text()).toContain("Claude Sonnet 4.6");
    expect(wrapper.text()).toContain("reasoning");
    expect(wrapper.text()).toContain("tool_call");

    await wrapper.get('[data-testid="model-cap-vision"]').trigger("click");
    await wrapper.get('[data-testid="model-toggle-enabled"]').trigger("click");
    await wrapper.get('[data-testid="model-delete"]').trigger("click");

    expect(wrapper.emitted("toggle-capability")).toEqual([[model, "vision"]]);
    expect(wrapper.emitted("toggle-enabled")).toEqual([[model]]);
    expect(wrapper.emitted("delete")).toEqual([[model]]);
  });

  it("does not emit delete when disabled", async () => {
    const wrapper = mount(GatewayModelCard, {
      props: { model, disabled: true },
    });

    await wrapper.get('[data-testid="model-delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
  });
});
