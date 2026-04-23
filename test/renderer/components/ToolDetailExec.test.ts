import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolDetailExec from "@/components/function/details/ToolDetailExec.vue";

describe("ToolDetailExec", () => {
  it("should display command", () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"ls -la","timeout_ms":30000}',
        response: '{"stdout":"file.ts\\nindex.ts","stderr":"","exit_code":0}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("ls -la");
    expect(wrapper.text()).not.toContain("timeout_ms");
  });

  it("should display stdout", () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"echo hi"}',
        response: '{"stdout":"hi\\n","stderr":"","exit_code":0}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("hi");
  });

  it("should display stderr when present", () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"bad"}',
        response: '{"stdout":"","stderr":"not found","exit_code":1}',
        status: "error",
      },
    });
    expect(wrapper.text()).toContain("not found");
  });

  it("should handle plain string response", () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"ls"}',
        response: "some output",
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("some output");
  });
});
