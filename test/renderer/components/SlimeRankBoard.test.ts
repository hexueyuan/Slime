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

    expect(wrapper.findAll(".truncate").at(1)?.text()).toBe("GLM");

    await wrapper.get("button:nth-of-type(2)").trigger("click");

    expect(wrapper.findAll(".truncate").at(1)?.text()).toBe("Claude");
    expect(wrapper.text()).toContain("$0.300");
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
});
