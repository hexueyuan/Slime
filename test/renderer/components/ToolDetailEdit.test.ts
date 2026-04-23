import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolDetailEdit from "@/components/function/details/ToolDetailEdit.vue";

describe("ToolDetailEdit", () => {
  it("should display file path", () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"src/app.ts","old_text":"const a = 1","new_text":"const a = 2"}',
        response: '"Edited src/app.ts"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("src/app.ts");
  });

  it("should show removed lines in red", () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"f.ts","old_text":"old line","new_text":"new line"}',
        status: "success",
      },
    });
    const html = wrapper.html();
    expect(html).toContain("old line");
    expect(html).toContain("new line");
  });

  it("should show multi-line diff", () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"f.ts","old_text":"line1\\nline2","new_text":"line1\\nchanged"}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("line2");
    expect(wrapper.text()).toContain("changed");
  });
});
