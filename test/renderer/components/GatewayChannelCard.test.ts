import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayChannelCard from "@/components/gateway/GatewayChannelCard.vue";
import type { Channel } from "@shared/types/gateway";

const channel: Channel = {
  id: 1,
  name: "百度OneApi",
  type: "anthropic",
  baseUrl: "https://example.com",
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayChannelCard", () => {
  it("renders channel summary and emits management actions", async () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel,
        modelCount: 13,
        stabilitySummary: "100.0%",
        testResult: { loading: false, success: true },
      },
    });

    expect(wrapper.text()).toContain("百度OneApi");
    expect(wrapper.text()).toContain("anthropic");
    expect(wrapper.text()).toContain("13");
    expect(wrapper.text()).toContain("100.0%");
    expect(wrapper.text()).toContain("连接成功");
    expect(
      wrapper
        .get('[data-testid="channel-status"]')
        .get('[data-testid="channel-status-dot"]')
        .exists(),
    ).toBe(true);

    await wrapper.get('[data-testid="channel-card"]').trigger("click");
    await wrapper.get('[data-testid="channel-test"]').trigger("click");
    await wrapper.get('[data-testid="channel-edit"]').trigger("click");
    await wrapper.get('[data-testid="channel-delete"]').trigger("click");
    await wrapper.get('[data-testid="channel-manage-models"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([[channel]]);
    expect(wrapper.emitted("test")).toEqual([[channel]]);
    expect(wrapper.emitted("edit")).toEqual([[channel]]);
    expect(wrapper.emitted("delete")).toEqual([[channel]]);
    expect(wrapper.emitted("manage-models")).toEqual([[channel]]);
  });

  it("marks selected channels and keeps action clicks from selecting the card", async () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel,
        modelCount: 13,
        selected: true,
      },
    });

    expect(wrapper.get('[data-testid="channel-card"]').attributes("data-selected")).toBe("true");

    await wrapper.get('[data-testid="channel-edit"]').trigger("click");

    expect(wrapper.emitted("edit")).toEqual([[channel]]);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("keeps disabled channels low emphasis but actions still explicit", () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel: { ...channel, enabled: false },
        modelCount: 0,
        stabilitySummary: "-",
      },
    });

    expect(wrapper.get('[data-testid="channel-status"]').text()).toContain("停用");
    expect(wrapper.get('[data-testid="channel-card"]').classes()).toContain("opacity-70");
  });

  it("keeps indeterminate test results neutral", () => {
    const wrapper = mount(GatewayChannelCard, {
      props: {
        channel,
        modelCount: 0,
        testResult: { loading: false },
      },
    });

    const testStatus = wrapper.get('[data-testid="channel-test-result"]');

    expect(testStatus.text()).toBe("-");
    expect(testStatus.classes()).toContain("text-[var(--color-text-muted)]");
    expect(testStatus.classes()).not.toContain("text-[var(--color-danger)]");
  });
});
