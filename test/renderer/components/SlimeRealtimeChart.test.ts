import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeRealtimeChart from "@/components/slime/SlimeRealtimeChart.vue";

describe("SlimeRealtimeChart", () => {
  it("emits no actions and switches the active metric locally", async () => {
    const wrapper = mount(SlimeRealtimeChart, {
      props: {
        title: "趋势",
        metrics: [
          { id: "requests", label: "请求", value: "10", points: [1, 3, 2] },
          { id: "cost", label: "费用", value: "$0.10", color: "warning", points: [0, 1, 1] },
        ],
      },
    });

    expect(wrapper.text()).toContain("趋势");
    expect(wrapper.text()).toContain("请求");

    await wrapper.get("button:nth-of-type(2)").trigger("click");

    expect(wrapper.text()).toContain("$0.10");
  });
});
