import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

describe("Renderer", () => {
  it("should render evolution center placeholder", () => {
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h("div", { class: "h-screen w-screen" }, [
            h("div", { class: "text-center" }, "Slime v0.1"),
          ]);
      },
    });
    const wrapper = mount(Wrapper);
    expect(wrapper.text()).toContain("Slime v0.1");
  });
});
