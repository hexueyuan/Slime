import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import AppShell from "@/components/layout/AppShell.vue";

function setViewportAndScreen(
  width: number,
  height: number,
  screenWidth = width,
  screenHeight = height,
  availableWidth = screenWidth,
  availableHeight = screenHeight,
) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(window.screen, "width", { configurable: true, value: screenWidth });
  Object.defineProperty(window.screen, "height", { configurable: true, value: screenHeight });
  Object.defineProperty(window.screen, "availWidth", { configurable: true, value: availableWidth });
  Object.defineProperty(window.screen, "availHeight", {
    configurable: true,
    value: availableHeight,
  });
}

function mountShell() {
  return mount(AppShell, {
    slots: {
      sidebar: "<div data-testid='sidebar-slot'></div>",
      default: "<div data-testid='main-slot'></div>",
    },
  });
}

describe("AppShell", () => {
  it("uses square edges when the window fills the screen", async () => {
    setViewportAndScreen(1440, 900);

    const wrapper = mountShell();
    await nextTick();
    const main = wrapper.get("main");
    const handle = wrapper.get('[data-testid="sidebar-resize-handle"]');

    expect(wrapper.attributes("data-fullscreen-like")).toBe("true");
    expect(wrapper.classes()).toContain("rounded-none");
    expect(wrapper.classes()).toContain("border-0");
    expect(wrapper.classes()).not.toContain("rounded-[18px]");
    expect(main.classes()).toContain("rounded-l-[15px]");
    expect(main.classes()).toContain("border-y");
    expect(handle.classes()).toContain("absolute");
    expect(handle.classes()).not.toContain("shrink-0");
  });

  it("keeps the rounded desktop window shell below fullscreen size", async () => {
    setViewportAndScreen(1280, 720, 1440, 900);

    const wrapper = mountShell();
    await nextTick();

    expect(wrapper.attributes("data-fullscreen-like")).toBe("false");
    expect(wrapper.classes()).toContain("rounded-[18px]");
    expect(wrapper.classes()).toContain("border");
  });
});
