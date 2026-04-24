import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PreviewRenderer from "@/components/function/renderers/PreviewRenderer.vue";
import type { PreviewContent } from "@shared/types/content";

describe("PreviewRenderer", () => {
  const base: PreviewContent = {
    type: "preview",
    html: "<h1>Hello</h1>",
  };

  it("should render iframe with srcdoc", () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } });
    const iframe = wrapper.find("iframe");
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes("srcdoc")).toBe("<h1>Hello</h1>");
  });

  it("should set sandbox without allow-same-origin", () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } });
    const iframe = wrapper.find("iframe");
    const sandbox = iframe.attributes("sandbox");
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
  });

  it("should show title when provided", () => {
    const wrapper = mount(PreviewRenderer, {
      props: { content: { ...base, title: "design.html" } },
    });
    expect(wrapper.text()).toContain("design.html");
  });

  it("should emit confirm on confirm button click", async () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } });
    await wrapper.find('[data-testid="preview-confirm"]').trigger("click");
    expect(wrapper.emitted("confirm")).toBeTruthy();
  });

  it("should emit adjust on adjust button click", async () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } });
    await wrapper.find('[data-testid="preview-adjust"]').trigger("click");
    expect(wrapper.emitted("adjust")).toBeTruthy();
  });

  it("should use custom button labels", () => {
    const wrapper = mount(PreviewRenderer, {
      props: {
        content: { ...base, confirmLabel: "LGTM", adjustLabel: "Redo" },
      },
    });
    expect(wrapper.find('[data-testid="preview-confirm"]').text()).toContain("LGTM");
    expect(wrapper.find('[data-testid="preview-adjust"]').text()).toContain("Redo");
  });
});
