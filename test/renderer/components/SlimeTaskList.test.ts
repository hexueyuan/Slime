import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeTaskList from "@/components/slime/SlimeTaskList.vue";

describe("SlimeTaskList", () => {
  it("emits selectTask when a task row is clicked", async () => {
    const wrapper = mount(SlimeTaskList, {
      props: {
        tasks: [{ id: "task-1", title: "整理计划", meta: "我 创建 → 哈尔" }],
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("selectTask")).toEqual([["task-1"]]);
  });

  it("emits createTask from the header action", async () => {
    const wrapper = mount(SlimeTaskList, {
      props: {
        showCreate: true,
        tasks: [],
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("createTask")).toEqual([[]]);
  });
});
