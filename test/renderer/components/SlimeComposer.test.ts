import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeComposer from "@/components/ui/SlimeComposer.vue";

describe("SlimeComposer", () => {
  it("submits trimmed text on Enter and clears the field", async () => {
    const wrapper = mount(SlimeComposer);
    const textarea = wrapper.get("textarea");

    await textarea.setValue("  hello slime  ");
    await textarea.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("submit")).toEqual([["hello slime"]]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
  });

  it("does not submit on Shift+Enter", async () => {
    const wrapper = mount(SlimeComposer);
    const textarea = wrapper.get("textarea");

    await textarea.setValue("hello");
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });

    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("emits stop while streaming", async () => {
    const wrapper = mount(SlimeComposer, { props: { isStreaming: true } });

    await wrapper.get('[data-testid="composer-stop"]').trigger("click");

    expect(wrapper.emitted("stop")).toEqual([[]]);
  });

  it("does not submit when disabled", async () => {
    const wrapper = mount(SlimeComposer, { props: { disabled: true } });
    const textarea = wrapper.get("textarea");

    await textarea.setValue("blocked");
    await textarea.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});
