import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeChecklist from "@/components/ui/SlimeChecklist.vue";

describe("SlimeChecklist", () => {
  it("emits toggle when a checkbox row is clicked", async () => {
    const wrapper = mount(SlimeChecklist, {
      props: {
        items: [
          {
            id: "mcp",
            title: "启用 MCP 工具",
            description: "允许当前 Agent 调用已授权的外部工具",
            checked: true,
          },
        ],
      },
    });

    await wrapper.get('[data-testid="check-row-mcp"]').trigger("click");

    expect(wrapper.emitted("toggle")).toEqual([["mcp", false]]);
  });

  it("emits toggle for switch rows", async () => {
    const wrapper = mount(SlimeChecklist, {
      props: {
        items: [
          {
            id: "router",
            title: "智能路由",
            checked: false,
            control: "switch",
          },
        ],
      },
    });

    await wrapper.get('[data-testid="check-row-router"]').trigger("click");

    expect(wrapper.emitted("toggle")).toEqual([["router", true]]);
  });

  it("does not emit toggle for disabled rows", async () => {
    const wrapper = mount(SlimeChecklist, {
      props: {
        items: [
          {
            id: "tool",
            title: "browser_click",
            checked: false,
            disabled: true,
          },
        ],
      },
    });

    await wrapper.get('[data-testid="check-row-tool"]').trigger("click");

    expect(wrapper.emitted("toggle")).toBeUndefined();
  });
});
