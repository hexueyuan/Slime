import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToolDetailGeneric from "@/components/function/details/ToolDetailGeneric.vue";

describe("ToolDetailGeneric", () => {
  it("should display formatted params", () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: '{"step_id":"s1","status":"completed"}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("step_id");
    expect(wrapper.text()).toContain("completed");
  });

  it("should display formatted response", () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: "{}",
        response: '{"ok":true}',
        status: "success",
      },
    });
    expect(wrapper.text()).toContain('"ok"');
  });

  it("should handle non-JSON response", () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: "{}",
        response: "plain text response",
        status: "success",
      },
    });
    expect(wrapper.text()).toContain("plain text response");
  });
});
