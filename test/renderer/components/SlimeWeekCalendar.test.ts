import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

describe("SlimeWeekCalendar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits selected date when a day card is clicked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T10:00:00+08:00"));

    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    await wrapper.get('[data-testid="week-day-2026-05-11"]').trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]).toEqual(["2026-05-11"]);
  });

  it("moves to the previous week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T10:00:00+08:00"));

    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    await wrapper.get('button[title="上一周"]').trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]).toEqual(["2026-05-04"]);
  });

  it("marks the day grid as compact-capable without horizontal scrolling", () => {
    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    const dayGrid = wrapper.get('[data-testid="week-day-grid"]');

    expect(wrapper.get('[data-component-id="SlimeWeekCalendar"]').attributes("data-layout")).toBe(
      "adaptive",
    );
    expect(dayGrid.attributes("data-layout")).toBe("responsive-compact-grid");
    expect(dayGrid.attributes("data-overflow-x")).toBe("none");
  });
});
