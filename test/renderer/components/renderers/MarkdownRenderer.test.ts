import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-markdown">{{ content }}</div>',
  },
}));

import MarkdownRenderer from "@/components/function/renderers/MarkdownRenderer.vue";
import type { MarkdownContent } from "@shared/types/content";

describe("MarkdownRenderer", () => {
  it("should render markdown content", () => {
    const content: MarkdownContent = { type: "markdown", content: "# Hello World" };
    const wrapper = mount(MarkdownRenderer, { props: { content } });
    expect(wrapper.text()).toContain("# Hello World");
  });

  it("should show title when provided", () => {
    const content: MarkdownContent = { type: "markdown", content: "body", title: "README.md" };
    const wrapper = mount(MarkdownRenderer, { props: { content } });
    expect(wrapper.text()).toContain("README.md");
  });

  it("should not show title area when no title", () => {
    const content: MarkdownContent = { type: "markdown", content: "body" };
    const wrapper = mount(MarkdownRenderer, { props: { content } });
    expect(wrapper.find('[data-testid="md-title"]').exists()).toBe(false);
  });
});
