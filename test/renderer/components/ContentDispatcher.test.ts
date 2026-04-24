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

  it("should render QuizRenderer for quiz type", () => {
    const content: FunctionContent = {
      type: "quiz",
      questions: [
        { id: "q1", text: "Q?", options: [{ value: "a", label: "A" }], allowCustom: false },
      ],
    };
    const wrapper = mount(ContentDispatcher, { props: { content } });
    expect(wrapper.text()).toContain("Q?");
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

  it("should render PreviewRenderer for preview type", () => {
    const content: FunctionContent = { type: "preview", html: "<p>Hi</p>" };
    const wrapper = mount(ContentDispatcher, { props: { content } });
    const iframe = wrapper.find("iframe");
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes("srcdoc")).toBe("<p>Hi</p>");
  });
});
