import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeTimeline from "@/components/slime/SlimeTimeline.vue";

describe("SlimeTimeline", () => {
  it("renders adaptive timeline entries and emits header actions", async () => {
    const wrapper = mount(SlimeTimeline, {
      props: {
        entries: [
          {
            id: "entry-1",
            label: "创建设计 spec",
            description: "确定组件拆分边界",
            time: "09:40",
            active: true,
          },
        ],
      },
    });

    expect(wrapper.get('[data-component-id="SlimeTimeline"]').attributes("data-layout")).toBe(
      "adaptive",
    );
    expect(wrapper.text()).toContain("创建设计 spec");

    await wrapper.get('button[title="回到今天"]').trigger("click");
    await wrapper.get('button[title="添加条目"]').trigger("click");

    expect(wrapper.emitted("locate")).toEqual([[]]);
    expect(wrapper.emitted("addEntry")).toEqual([[]]);
  });
});
