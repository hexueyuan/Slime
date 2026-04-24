import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: "<div>{{ content }}</div>",
  },
}));

import ContentDispatcher from "@/components/function/ContentDispatcher.vue";
import type { FunctionContent } from "@shared/types/content";

describe("ContentDispatcher", () => {
  it("should show empty state when content is null", () => {
    const wrapper = mount(ContentDispatcher, { props: { content: null } });
    expect(wrapper.text()).toContain("暂无预览内容");
  });

  it("should render InteractionRenderer for interaction type", () => {
    const content: FunctionContent = {
      type: "interaction",
      question: "Pick one",
      options: [{ value: "a", label: "Option A" }],
    };
    const wrapper = mount(ContentDispatcher, { props: { content } });
    expect(wrapper.text()).toContain("Pick one");
  });

  it("should render MarkdownRenderer for markdown type", () => {
    const content: FunctionContent = { type: "markdown", content: "# Title" };
    const wrapper = mount(ContentDispatcher, { props: { content } });
    expect(wrapper.text()).toContain("# Title");
  });

  it("should render ProgressRenderer for progress type", () => {
    const content: FunctionContent = {
      type: "progress",
      percentage: 75,
      label: "Building",
      stage: "coding",
    };
    const wrapper = mount(ContentDispatcher, { props: { content } });
    expect(wrapper.text()).toContain("75%");
  });
});
