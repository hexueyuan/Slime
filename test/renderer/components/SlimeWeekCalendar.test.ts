import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

describe("SlimeWeekCalendar", () => {
  it("emits selected date when a day card is clicked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T10:00:00+08:00"));

    const wrapper = mount(SlimeWeekCalendar, {
      props: {
        selectedDate: "2026-05-17",
      },
    });

    await wrapper.get("button:nth-of-type(2)").trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]).toEqual(["2026-05-11"]);

    vi.useRealTimers();
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

    vi.useRealTimers();
  });
});
