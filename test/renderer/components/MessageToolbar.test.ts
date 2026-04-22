import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageToolbar from "@/components/message/MessageToolbar.vue";

describe("MessageToolbar", () => {
  it("should render copy button", () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    expect(wrapper.find('[data-testid="toolbar-copy"]').exists()).toBe(true);
  });

  it("should render retry button for assistant", () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    expect(wrapper.find('[data-testid="toolbar-retry"]').exists()).toBe(true);
  });

  it("should emit copy on click", async () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    await wrapper.find('[data-testid="toolbar-copy"]').trigger("click");
    expect(wrapper.emitted("copy")).toBeTruthy();
  });

  it("should emit retry on click", async () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    await wrapper.find('[data-testid="toolbar-retry"]').trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
  });
});
