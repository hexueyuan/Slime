import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlimeWeekCalendar from "@/components/slime/SlimeWeekCalendar.vue";

describe("SlimeWeekCalendar", () => {
  it("emits selected date when a day is clicked", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const wrapper = mount(SlimeWeekCalendar, {
      props: { selectedDate: today },
    });

    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("update:selectedDate")).toBeTruthy();
  });

  it("moves week and emits a date when selected date is outside the visible week", async () => {
    const wrapper = mount(SlimeWeekCalendar, {
      props: { selectedDate: "1999-01-01" },
    });

    await wrapper.find('[title="下一周"]').trigger("click");

    expect(wrapper.emitted("update:selectedDate")?.[0]?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
