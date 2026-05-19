import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChannelRealtimeChart from "@/components/gateway/ChannelRealtimeChart.vue";
import SlimeRealtimeChart from "@/components/slime/SlimeRealtimeChart.vue";

function localMinute(minutesAgo: number): string {
  const now = new Date();
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  const t = new Date(base.getTime() - minutesAgo * 60 * 1000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

describe("ChannelRealtimeChart", () => {
  it("renders channel stability through the standard SlimeRealtimeChart", () => {
    const wrapper = mount(ChannelRealtimeChart, {
      props: {
        points: [
          { minute: localMinute(2), successCount: 9, failCount: 1, avgLatencyMs: 1200 },
          { minute: localMinute(1), successCount: 10, failCount: 0, avgLatencyMs: 2500 },
        ],
      },
    });

    const chart = wrapper.getComponent(SlimeRealtimeChart);
    expect(chart.props("title")).toBe("稳定性");
    expect(chart.props("subtitle")).toBe("近30分钟");
    expect(chart.props("metrics")).toMatchObject([
      { id: "availability", label: "可用率", value: "95.0%" },
      { id: "latency", label: "平均延迟", value: "1.9s" },
    ]);
  });

  it("does not turn missing latency samples into zero values", () => {
    const wrapper = mount(ChannelRealtimeChart, {
      props: {
        points: [
          { minute: localMinute(3), successCount: 1, failCount: 0, avgLatencyMs: null },
          { minute: localMinute(2), successCount: 1, failCount: 0, avgLatencyMs: 820 },
          { minute: localMinute(1), successCount: 1, failCount: 0, avgLatencyMs: null },
        ],
      },
    });

    const chart = wrapper.getComponent(SlimeRealtimeChart);
    const latencyMetric = chart.props("metrics").find((metric) => metric.id === "latency");

    expect(latencyMetric).toMatchObject({
      value: "820ms",
      points: [820],
    });
  });

  it("can render only the availability metric as its own chart", () => {
    const wrapper = mount(ChannelRealtimeChart, {
      props: {
        metric: "availability",
        points: [
          { minute: localMinute(2), successCount: 9, failCount: 1, avgLatencyMs: 1200 },
          { minute: localMinute(1), successCount: 10, failCount: 0, avgLatencyMs: 2500 },
        ],
      },
    });

    const chart = wrapper.getComponent(SlimeRealtimeChart);

    expect(chart.props("title")).toBe("可用率");
    expect(chart.props("metrics")).toMatchObject([
      { id: "availability", label: "可用率", value: "95.0%" },
    ]);
  });

  it("can render only the latency metric as its own chart", () => {
    const wrapper = mount(ChannelRealtimeChart, {
      props: {
        metric: "latency",
        points: [
          { minute: localMinute(2), successCount: 9, failCount: 1, avgLatencyMs: 1200 },
          { minute: localMinute(1), successCount: 10, failCount: 0, avgLatencyMs: 2500 },
        ],
      },
    });

    const chart = wrapper.getComponent(SlimeRealtimeChart);

    expect(chart.props("title")).toBe("平均延迟");
    expect(chart.props("metrics")).toMatchObject([
      { id: "latency", label: "平均延迟", value: "1.9s" },
    ]);
  });
});
