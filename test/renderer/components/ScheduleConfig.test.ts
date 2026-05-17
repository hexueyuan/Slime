import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ScheduleConfig from "@/components/schedule/ScheduleConfig.vue";

describe("ScheduleConfig", () => {
  it("emits the next hour when scheduling is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T10:12:00+08:00"));

    const wrapper = mount(ScheduleConfig);

    await wrapper.get('[data-testid="check-row-scheduled"]').trigger("click");

    expect(wrapper.emitted("update:scheduledAt")?.[0]).toEqual([
      new Date("2026-05-16T11:00:00+08:00").getTime(),
    ]);

    vi.useRealTimers();
  });

  it("clears repeat interval when repeat is disabled", async () => {
    const wrapper = mount(ScheduleConfig, {
      props: {
        scheduledAt: new Date("2026-05-16T11:00:00+08:00").getTime(),
        repeatInterval: 1440,
      },
    });

    await wrapper.get('[data-testid="check-row-repeat"]').trigger("click");

    expect(wrapper.emitted("update:repeatInterval")?.[0]).toEqual([undefined]);
  });
});
