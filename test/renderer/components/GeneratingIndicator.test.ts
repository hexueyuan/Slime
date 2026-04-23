import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GeneratingIndicator from "@/components/chat/GeneratingIndicator.vue";

describe("GeneratingIndicator", () => {
  it("renders spinner and text with correct color", () => {
    const wrapper = mount(GeneratingIndicator, {
      props: {
        text: "正在思考...",
        color: "hsl(265 90% 66%)",
      },
    });
    expect(wrapper.text()).toContain("正在思考...");
    const spinner = wrapper.find('[data-testid="spinner"]');
    expect(spinner.exists()).toBe(true);
    // JSDOM applies inline styles - check border-color is set
    const style = spinner.attributes("style") || "";
    expect(style).toContain("border-color");
  });
});
