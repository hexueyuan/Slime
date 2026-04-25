import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";

import CyberClock from "@/components/clock/CyberClock.vue";

describe("CyberClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("should render the cyber-clock container", () => {
    const wrapper = mount(CyberClock);
    expect(wrapper.find('[data-testid="cyber-clock"]').exists()).toBe(true);
  });

  it("should display AM for morning hours (9:30 AM)", async () => {
    // Set time BEFORE mount
    const mockDate = new Date(2025, 0, 1, 9, 30, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    expect(wrapper.find(".ampm-badge").text()).toBe("AM");
    expect(wrapper.find(".ampm-badge").classes()).not.toContain("pm");
  });

  it("should display PM for afternoon hours (15:30 PM)", async () => {
    const mockDate = new Date(2025, 0, 1, 15, 30, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    expect(wrapper.find(".ampm-badge").text()).toBe("PM");
    expect(wrapper.find(".ampm-badge").classes()).toContain("pm");
  });

  it("should display 12 for midnight (0:00) in 12h format", async () => {
    const mockDate = new Date(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    const digitEls = wrapper.findAll(".digit");
    const hourDigits = [digitEls[0].text(), digitEls[1].text()];
    expect(hourDigits.join("")).toBe("12");
    expect(wrapper.find(".ampm-badge").text()).toBe("AM");
  });

  it("should display 12 for noon (12:00) in 12h format", async () => {
    const mockDate = new Date(2025, 0, 1, 12, 0, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    const digitEls = wrapper.findAll(".digit");
    const hourDigits = [digitEls[0].text(), digitEls[1].text()];
    expect(hourDigits.join("")).toBe("12");
    expect(wrapper.find(".ampm-badge").text()).toBe("PM");
  });

  it("should display 01 for 13:00 (1 PM) in 12h format", async () => {
    const mockDate = new Date(2025, 0, 1, 13, 0, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    const digitEls = wrapper.findAll(".digit");
    const hourDigits = [digitEls[0].text(), digitEls[1].text()];
    expect(hourDigits.join("")).toBe("01");
    expect(wrapper.find(".ampm-badge").text()).toBe("PM");
  });

  it("should display 6 digit-boxes for time", () => {
    const wrapper = mount(CyberClock);
    const digitBoxes = wrapper.findAll(".digit-box");
    expect(digitBoxes).toHaveLength(6);
  });

  it("should display date string in info row", async () => {
    const mockDate = new Date(2025, 5, 12, 10, 0, 0);
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    expect(wrapper.find(".date-text").text()).toBe("2025-06-12");
  });

  it("should display weekday in info row", async () => {
    const mockDate = new Date(2025, 5, 12, 10, 0, 0); // Thursday
    vi.setSystemTime(mockDate);

    const wrapper = mount(CyberClock);
    await nextTick();

    expect(wrapper.find(".weekday-text").text()).toBe("Thursday");
  });
});
