import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayGroupCard from "@/components/gateway/GatewayGroupCard.vue";
import type { Group } from "@shared/types/gateway";

const group: Group = {
  id: 1,
  name: "claude",
  balanceMode: "failover",
  isBuiltin: false,
  createdAt: "",
  updatedAt: "",
};

describe("GatewayGroupCard", () => {
  it("renders group summary and emits edit/delete", async () => {
    const wrapper = mount(GatewayGroupCard, {
      props: {
        group,
        itemCount: 3,
        channelSummary: "百度OneApi / OfoxAI",
      },
    });

    expect(wrapper.text()).toContain("claude");
    expect(wrapper.text()).toContain("failover");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("百度OneApi / OfoxAI");

    await wrapper.get('[data-testid="group-edit"]').trigger("click");
    await wrapper.get('[data-testid="group-delete"]').trigger("click");

    expect(wrapper.emitted("edit")).toEqual([[group]]);
    expect(wrapper.emitted("delete")).toEqual([[group]]);
  });

  it("does not emit delete for builtin groups", async () => {
    const builtin = { ...group, isBuiltin: true };
    const wrapper = mount(GatewayGroupCard, {
      props: { group: builtin, itemCount: 1, channelSummary: "内置" },
    });

    expect(wrapper.find('[data-testid="group-delete"]').exists()).toBe(false);
  });
});
