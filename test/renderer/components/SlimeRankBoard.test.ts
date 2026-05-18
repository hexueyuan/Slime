import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeRankBoard from "@/components/slime/SlimeRankBoard.vue";

describe("SlimeRankBoard", () => {
  it("renders ranked items", () => {
    const wrapper = mount(SlimeRankBoard, {
      props: {
        title: "供应商排名",
        items: [
          { id: 1, label: "Claude", value: "24" },
          { id: 2, label: "DeepSeek", value: "12" },
        ],
      },
    });

    expect(wrapper.text()).toContain("供应商排名");
    expect(wrapper.text()).toContain("Claude");
    expect(wrapper.text()).toContain("24");
  });

  it("switches ranking metrics and reorders by the selected metric", async () => {
    const wrapper = mount(SlimeRankBoard, {
      props: {
        title: "模型排名",
        metrics: [
          { value: "requests", label: "请求" },
          { value: "cost", label: "费用" },
        ],
        items: [
          {
            id: "claude",
            label: "Claude",
            values: { requests: "8", cost: "$0.300" },
            sortValues: { requests: 8, cost: 0.3 },
          },
          {
            id: "glm",
            label: "GLM",
            values: { requests: "12", cost: "$0.100" },
            sortValues: { requests: 12, cost: 0.1 },
          },
        ],
      },
    });

    expect(wrapper.get('[data-testid="rank-item-0"]').text()).toContain("GLM");

    await wrapper.get('[data-testid="rank-metric-cost"]').trigger("click");

    const firstRankedRow = wrapper.get('[data-testid="rank-item-0"]');
    expect(firstRankedRow.text()).toContain("Claude");
    expect(firstRankedRow.text()).toContain("$0.300");
  });

  it("renders empty state", () => {
    const wrapper = mount(SlimeRankBoard, {
      props: {
        title: "模型排名",
        items: [],
      },
    });

    expect(wrapper.text()).toContain("暂无数据");
  });

  it("marks metric controls as wrap-capable", () => {
    const wrapper = mount(SlimeRankBoard, {
      props: {
        title: "模型排名",
        metrics: [
          { value: "requests", label: "请求" },
          { value: "cost", label: "费用" },
          { value: "tokens", label: "Token" },
        ],
        items: [
          {
            id: "claude",
            label: "Claude",
            values: { requests: "8", cost: "$0.300", tokens: "1.2k" },
            sortValues: { requests: 8, cost: 0.3, tokens: 1200 },
          },
        ],
      },
    });

    const metricTabs = wrapper.get('[data-testid="rank-metric-tabs"]');

    expect(metricTabs.attributes("data-layout")).toBe("wrap");
  });
});
