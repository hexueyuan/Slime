import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeResourceCard from "@/components/slime/SlimeResourceCard.vue";
import SlimeBadge from "@/components/ui/SlimeBadge.vue";
import SlimePanel from "@/components/ui/SlimePanel.vue";

describe("SlimeResourceCard", () => {
  it("renders a responsive resource card with badges, facts, and detail text", () => {
    const wrapper = mount(SlimeResourceCard, {
      props: {
        kind: "group",
        eyebrow: "分组路由",
        title: "cc-auto",
        subtitle: "故障转移策略",
        badges: [
          { label: "自定义", variant: "accent" },
          { label: "2 渠道", variant: "neutral" },
        ],
        stats: [
          { label: "均衡策略", value: "故障转移" },
          { label: "成员数量", value: "2" },
        ],
        detailLabel: "渠道成员",
        detailValue: "Claude / claude-sonnet",
      },
    });

    const card = wrapper.get('[data-testid="slime-resource-card"]');
    expect(card.attributes("data-resource-kind")).toBe("group");
    expect(card.attributes("data-layout")).toBe("adaptive");
    expect(wrapper.getComponent(SlimePanel).exists()).toBe(true);
    expect(wrapper.findAllComponents(SlimeBadge)).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="slime-resource-fact"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("cc-auto");
    expect(wrapper.text()).toContain("Claude / claude-sonnet");
  });

  it("marks selected resources without requiring a fixed height", () => {
    const wrapper = mount(SlimeResourceCard, {
      props: {
        kind: "key",
        eyebrow: "API Key",
        title: "web-client",
        subtitle: "sk-1...abcd",
        selected: true,
      },
    });

    const card = wrapper.get('[data-testid="slime-resource-card"]');
    expect(card.attributes("data-selected")).toBe("true");
    expect(card.classes().some((className) => className.startsWith("h-"))).toBe(false);
  });
});
