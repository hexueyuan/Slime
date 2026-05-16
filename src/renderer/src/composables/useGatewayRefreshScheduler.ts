export interface GatewayRefreshSchedulerOptions {
  debounceMs?: number;
  minIntervalMs?: number;
}

export interface GatewayRefreshRequestOptions {
  immediate?: boolean;
}

export interface GatewayRefreshScheduler {
  request(options?: GatewayRefreshRequestOptions): void;
  dispose(): void;
}

export function createGatewayRefreshScheduler(
  refresh: () => Promise<void> | void,
  options: GatewayRefreshSchedulerOptions = {},
): GatewayRefreshScheduler {
  const debounceMs = options.debounceMs ?? 500;
  const minIntervalMs = options.minIntervalMs ?? 1_500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  let pendingImmediate = false;
  let disposed = false;
  let lastRunAt = 0;

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule(delayMs: number) {
    clearTimer();
    timer = setTimeout(run, delayMs);
  }

  async function run() {
    timer = null;
    if (disposed || running || !pending) return;

    const now = Date.now();
    const elapsed = now - lastRunAt;
    if (!pendingImmediate && elapsed < minIntervalMs) {
      schedule(minIntervalMs - elapsed);
      return;
    }

    pending = false;
    pendingImmediate = false;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
      lastRunAt = Date.now();
      if (pending && !disposed) schedule(Math.max(debounceMs, minIntervalMs));
    }
  }

  return {
    request(requestOptions = {}) {
      if (disposed) return;
      pending = true;
      pendingImmediate ||= requestOptions.immediate === true;
      if (running) return;
      schedule(requestOptions.immediate ? 0 : debounceMs);
    },
    dispose() {
      disposed = true;
      pending = false;
      pendingImmediate = false;
      clearTimer();
    },
  };
}
