import { describe, it, expect, vi, afterEach } from "vitest";
import { createGatewayRefreshScheduler } from "@/composables/useGatewayRefreshScheduler";

describe("createGatewayRefreshScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("合并短时间内的多次刷新请求", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createGatewayRefreshScheduler(refresh, {
      debounceMs: 100,
      minIntervalMs: 1000,
    });

    scheduler.request();
    scheduler.request();
    scheduler.request();

    await vi.advanceTimersByTimeAsync(99);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("运行中收到新请求时，在当前刷新结束后再补一次", async () => {
    vi.useFakeTimers();
    let resolveFirst: (() => void) | undefined;
    const refresh = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const scheduler = createGatewayRefreshScheduler(refresh, {
      debounceMs: 0,
      minIntervalMs: 50,
    });

    scheduler.request({ immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.request();
    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(50);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("dispose 会取消等待中的刷新", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createGatewayRefreshScheduler(refresh, {
      debounceMs: 100,
      minIntervalMs: 1000,
    });

    scheduler.request();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(refresh).not.toHaveBeenCalled();
  });
});
