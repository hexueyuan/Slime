import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolDetailRead from "@/components/function/details/ToolDetailRead.vue";

describe("ToolDetailRead", () => {
  it("should display file path", () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"src/main/index.ts"}',
        response: '"line1\\nline2\\nline3"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("src/main/index.ts");
  });

  it("should display line numbers", () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts","offset":0,"limit":3}',
        response: '"const a = 1\\nconst b = 2\\nconst c = 3"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("const a = 1");
  });

  it("should show offset in line numbers", () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts","offset":10}',
        response: '"line at 10\\nline at 11"',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("11");
    expect(wrapper.text()).toContain("12");
  });

  it("should handle object response", () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts"}',
        response: '{"content":"hello world","lines":1}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("hello world");
  });
});
