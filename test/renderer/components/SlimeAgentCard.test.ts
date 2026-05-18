import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeAgentCard from "@/components/slime/SlimeAgentCard.vue";

describe("SlimeAgentCard", () => {
  it("emits select when enabled", async () => {
    const wrapper = mount(SlimeAgentCard, {
      props: {
        name: "哈尔",
        role: "reasoning",
        description: "负责拆解任务并规划实现路径",
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("does not emit select when disabled", async () => {
    const wrapper = mount(SlimeAgentCard, {
      props: {
        name: "莫斯",
        role: "review",
        description: "适合审查方案和补足风险判断",
        disabled: true,
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
  });
});
