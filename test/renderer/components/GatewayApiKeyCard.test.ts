import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayApiKeyCard from "@/components/gateway/GatewayApiKeyCard.vue";
import type { GatewayApiKey } from "@shared/types/gateway";

const apiKey: GatewayApiKey = {
  id: 1,
  name: "web-client",
  key: "sk-1234567890abcdef",
  enabled: true,
  isInternal: false,
  createdAt: "",
};

describe("GatewayApiKeyCard", () => {
  it("renders masked key and emits actions", async () => {
    const wrapper = mount(GatewayApiKeyCard, { props: { apiKey } });

    expect(wrapper.text()).toContain("web-client");
    expect(wrapper.text()).toContain("sk-1...cdef");

    await wrapper.get('[data-testid="key-copy"]').trigger("click");
    await wrapper.get('[data-testid="key-toggle-enabled"]').trigger("click");
    await wrapper.get('[data-testid="key-delete"]').trigger("click");

    expect(wrapper.emitted("copy")).toEqual([[apiKey]]);
    expect(wrapper.emitted("toggle-enabled")).toEqual([[apiKey]]);
    expect(wrapper.emitted("delete")).toEqual([[apiKey]]);
  });

  it("shows revealed key when provided and hides delete for internal keys", () => {
    const wrapper = mount(GatewayApiKeyCard, {
      props: {
        apiKey: { ...apiKey, isInternal: true },
        revealedKey: "sk-new-secret",
      },
    });

    expect(wrapper.text()).toContain("sk-new-secret");
    expect(wrapper.find('[data-testid="key-delete"]').exists()).toBe(false);
  });

  it("does not render the full raw key for short keys unless revealed", () => {
    const shortKey = "sk-12345";
    const wrapper = mount(GatewayApiKeyCard, {
      props: { apiKey: { ...apiKey, key: shortKey } },
    });

    expect(wrapper.text()).not.toContain(shortKey);
    expect(wrapper.text()).toContain("sk...");
  });

  it("does not render the full raw key for four-character keys", () => {
    const shortKey = "abcd";
    const wrapper = mount(GatewayApiKeyCard, {
      props: { apiKey: { ...apiKey, key: shortKey } },
    });

    expect(wrapper.text()).not.toContain(shortKey);
    expect(wrapper.text()).toContain("...");
  });

  it("does not render the full raw key for one-character keys", () => {
    const shortKey = "a";
    const wrapper = mount(GatewayApiKeyCard, {
      props: { apiKey: { ...apiKey, key: shortKey } },
    });

    expect(wrapper.text()).not.toContain(shortKey);
    expect(wrapper.text()).toContain("...");
  });
});
