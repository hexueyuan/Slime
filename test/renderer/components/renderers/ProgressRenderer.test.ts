import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProgressRenderer from "@/components/function/renderers/ProgressRenderer.vue";
import type { ProgressContent } from "@shared/types/content";

describe("ProgressRenderer", () => {
  const base: ProgressContent = {
    type: "progress",
    percentage: 42,
    label: "Compiling...",
    stage: "coding",
  };

  it("should display percentage", () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } });
    expect(wrapper.text()).toContain("42%");
  });

  it("should display label", () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } });
    expect(wrapper.text()).toContain("Compiling...");
  });

  it("should display stage", () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } });
    expect(wrapper.text()).toContain("coding");
  });

  it("should set bar width via style", () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } });
    const bar = wrapper.find('[data-testid="progress-bar"]');
    expect(bar.attributes("style")).toContain("width: 42%");
  });

  it("should not show cancel button by default", () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } });
    expect(wrapper.find('[data-testid="progress-cancel"]').exists()).toBe(false);
  });

  it("should show cancel button when cancellable", () => {
    const wrapper = mount(ProgressRenderer, {
      props: { content: { ...base, cancellable: true } },
    });
    expect(wrapper.find('[data-testid="progress-cancel"]').exists()).toBe(true);
  });

  it("should emit cancel on button click", async () => {
    const wrapper = mount(ProgressRenderer, {
      props: { content: { ...base, cancellable: true } },
    });
    await wrapper.find('[data-testid="progress-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });
});
