import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockImage from "@/components/message/MessageBlockImage.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockImage", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "image",
    content: "",
    status: "success",
    timestamp: Date.now(),
    image_data: { data: "iVBORw0KGgo=", mimeType: "image/png" },
    ...overrides,
  });

  it("should render image with base64 src", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock() },
    });
    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toContain("data:image/png;base64,");
  });

  it("should show loading state", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock({ status: "loading", image_data: undefined }) },
    });
    expect(wrapper.find(".animate-spin").exists()).toBe(true);
  });

  it("should show error text when image_data is missing and not loading", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock({ image_data: undefined }) },
    });
    expect(wrapper.text()).toContain("无法加载图片");
  });
});
