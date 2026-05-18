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

  it("renders x-axis labels and visible values for the active metric", () => {
    const wrapper = mount(SlimeRealtimeChart, {
      props: {
        title: "趋势",
        metrics: [
          {
            id: "requests",
            label: "请求",
            value: "12",
            points: [2, 7, 3],
            labels: ["00:00", "01:00", "02:00"],
          },
        ],
      },
    });

    expect(wrapper.findAll('[data-testid="chart-x-label"]').map((item) => item.text())).toEqual([
      "00:00",
      "01:00",
      "02:00",
    ]);
    expect(wrapper.findAll('[data-testid="chart-value-label"]').map((item) => item.text())).toEqual(
      ["2", "7", "3"],
    );
  });

  it("uses the component-library chart shell with metric cards and bars", () => {
    const wrapper = mount(SlimeRealtimeChart, {
      props: {
        title: "趋势",
        subtitle: "按小时统计",
        metrics: [
          { id: "requests", label: "请求", value: "469", points: [1, 3, 2] },
          { id: "cost", label: "费用", value: "$0.00", color: "warning", points: [0, 1, 1] },
          { id: "input", label: "Input", value: "476.3K", color: "blue", points: [3, 2, 5] },
          { id: "output", label: "Output", value: "112.7K", color: "success", points: [2, 4, 1] },
        ],
      },
    });

    expect(wrapper.get('[data-testid="chart-summary-value"]').text()).toBe("469");
    expect(wrapper.findAll('[data-testid="chart-metric-pill"]')).toHaveLength(4);
    expect(wrapper.get('[data-testid="chart-window"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="chart-bar"]')).toHaveLength(3);
  });

  it("marks compact chart density on the root", () => {
    const wrapper = mount(SlimeRealtimeChart, {
      props: {
        title: "趋势",
        compact: true,
        metrics: [{ id: "requests", label: "请求", value: "10", points: [1, 3, 2] }],
      },
    });

    const chart = wrapper.get('[data-testid="slime-realtime-chart"]');

    expect(chart.attributes("data-density")).toBe("compact");
  });
});
