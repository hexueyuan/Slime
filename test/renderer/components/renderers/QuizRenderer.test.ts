import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import QuizRenderer from "@/components/function/renderers/QuizRenderer.vue";
import type { QuizContent } from "@shared/types/content";

const singleQuiz: QuizContent = {
  type: "quiz",
  questions: [
    {
      id: "q1",
      text: "Pick a color",
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue", recommended: true },
      ],
      allowCustom: false,
    },
  ],
};

const multiQuiz: QuizContent = {
  type: "quiz",
  questions: [
    {
      id: "q1",
      text: "Pick features",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      allowCustom: true,
      multiple: true,
    },
  ],
};

describe("QuizRenderer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render questions and options", () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } });
    expect(wrapper.text()).toContain("Pick a color");
    expect(wrapper.text()).toContain("Red");
    expect(wrapper.text()).toContain("Blue");
  });

  it("should show recommended badge", () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } });
    expect(wrapper.text()).toContain("推荐");
  });

  it("should disable submit when no selection", () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } });
    const btn = wrapper.find('[data-testid="quiz-submit"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("should enable submit after selecting an option", async () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } });
    const radios = wrapper.findAll('input[type="radio"]');
    await radios[0].setValue(true);
    const btn = wrapper.find('[data-testid="quiz-submit"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it("should emit submit with answers", async () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } });
    const radios = wrapper.findAll('input[type="radio"]');
    await radios[0].setValue(true);
    await wrapper.find('[data-testid="quiz-submit"]').trigger("click");
    expect(wrapper.emitted("submit")).toBeTruthy();
    expect(wrapper.emitted("submit")![0][0]).toEqual({ q1: "red" });
  });

  it("should show custom input when allowCustom", () => {
    const wrapper = mount(QuizRenderer, { props: { content: multiQuiz } });
    expect(wrapper.find('[data-testid="quiz-custom-input"]').exists()).toBe(true);
  });
});
