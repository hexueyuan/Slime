import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolDetailWrite from "@/components/function/details/ToolDetailWrite.vue";

describe("ToolDetailWrite", () => {
  it("should display file path", () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"src/new.ts","content":"export const x = 1"}',
        response: '"Written to src/new.ts"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("src/new.ts");
  });

  it("should display content with line numbers", () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"f.ts","content":"line1\\nline2\\nline3"}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("line1");
    expect(wrapper.text()).toContain("3");
  });

  it("should show response status", () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"f.ts","content":"x"}',
        response: '"Written to f.ts"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("Written to f.ts");
  });
});
