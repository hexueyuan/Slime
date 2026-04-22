import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import MessageBlockContent from "@/components/message/MessageBlockContent.vue";

describe("MessageBlockContent", () => {
  it("should render with prose classes", () => {
    const wrapper = mount(MessageBlockContent, {
      props: { content: "Hello **world**", blockId: "b1" },
    });
    expect(wrapper.find(".prose").exists()).toBe(true);
  });

  it("should pass content to NodeRenderer", () => {
    const wrapper = mount(MessageBlockContent, {
      props: { content: "test content", blockId: "b2" },
    });
    expect(wrapper.text()).toContain("test content");
  });
});
