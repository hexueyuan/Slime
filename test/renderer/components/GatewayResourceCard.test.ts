import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GatewayResourceCard from "@/components/gateway/GatewayResourceCard.vue";
import SlimePanel from "@/components/ui/SlimePanel.vue";
import SlimeBadge from "@/components/ui/SlimeBadge.vue";

describe("GatewayResourceCard", () => {
  it("renders a gateway resource with component-library panel and badges", () => {
    const wrapper = mount(GatewayResourceCard, {
      props: {
        kind: "group",
        eyebrow: "分组路由",
        title: "cc-auto",
        subtitle: "failover",
        badges: [
          { label: "自定义", variant: "accent" },
          { label: "2 渠道", variant: "neutral" },
        ],
        stats: [
          { label: "策略", value: "failover" },
          { label: "成员", value: "2" },
        ],
        detailLabel: "渠道成员",
        detailValue: "Claude / claude-sonnet",
      },
    });

    expect(
      wrapper.get('[data-testid="gateway-resource-card"]').attributes("data-resource-kind"),
    ).toBe("group");
    expect(wrapper.getComponent(SlimePanel).exists()).toBe(true);
    expect(wrapper.findAllComponents(SlimeBadge)).toHaveLength(2);
    expect(wrapper.text()).toContain("cc-auto");
    expect(wrapper.text()).toContain("Claude / claude-sonnet");
  });
});
