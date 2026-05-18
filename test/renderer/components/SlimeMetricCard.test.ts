import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeMetricCard from "@/components/slime/SlimeMetricCard.vue";

describe("SlimeMetricCard", () => {
  it("renders label, value, and metadata", () => {
    const wrapper = mount(SlimeMetricCard, {
      props: {
        label: "请求",
        value: "1.2K",
        meta: "今日",
        tone: "accent",
      },
    });

    expect(wrapper.text()).toContain("请求");
    expect(wrapper.text()).toContain("1.2K");
    expect(wrapper.text()).toContain("今日");
  });
});
