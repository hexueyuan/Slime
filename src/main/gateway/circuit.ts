export interface CircuitBreakerConfig {
  failureThreshold: number;
  baseCooldown: number;
  maxCooldown: number;
}

interface CircuitEntry {
  state: "closed" | "open" | "half_open";
  failures: number;
  lastFailureAt: number;
  tripCount: number;
}

export interface CircuitBreaker {
  isTripped(channelId: number, keyId: number, model: string): boolean;
  recordSuccess(channelId: number, keyId: number, model: string): void;
  recordFailure(channelId: number, keyId: number, model: string): void;
  getHealthScore(channelId: number, model: string): number;
  reset(): void;
}

const DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 5,
  baseCooldown: 30_000,
  maxCooldown: 300_000,
};

function entryKey(channelId: number, keyId: number, model: string): string {
  return `${channelId}:${keyId}:${model}`;
}

export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  const cfg = { ...DEFAULTS, ...config };
  const entries = new Map<string, CircuitEntry>();

  function getEntry(key: string): CircuitEntry {
    let e = entries.get(key);
    if (!e) {
      e = { state: "closed", failures: 0, lastFailureAt: 0, tripCount: 0 };
      entries.set(key, e);
    }
    return e;
  }

  function cooldownFor(tripCount: number): number {
    const cd = cfg.baseCooldown * Math.pow(2, tripCount - 1);
    return Math.min(cd, cfg.maxCooldown);
  }

  return {
    isTripped(channelId, keyId, model) {
      const key = entryKey(channelId, keyId, model);
      const e = entries.get(key);
      if (!e) return false;

      switch (e.state) {
        case "closed":
          return false;
        case "open": {
          const elapsed = Date.now() - e.lastFailureAt;
          if (elapsed >= cooldownFor(e.tripCount)) {
            e.state = "half_open";
            return false;
          }
          return true;
        }
        case "half_open":
          return true;
      }
    },

    recordSuccess(channelId, keyId, model) {
      const key = entryKey(channelId, keyId, model);
      const e = entries.get(key);
      if (!e) return;
      e.state = "closed";
      e.failures = 0;
      e.tripCount = 0;
    },

    recordFailure(channelId, keyId, model) {
      const key = entryKey(channelId, keyId, model);
      const e = getEntry(key);
      e.lastFailureAt = Date.now();

      if (e.state === "closed") {
        e.failures++;
        if (e.failures >= cfg.failureThreshold) {
          e.state = "open";
          e.tripCount++;
        }
      } else if (e.state === "half_open") {
        e.state = "open";
        e.tripCount++;
      }
    },

    getHealthScore(channelId, model) {
      const prefix = `${channelId}:`;
      const suffix = `:${model}`;
      let total = 0;
      let healthy = 0;
      for (const [key, e] of entries) {
        if (key.startsWith(prefix) && key.endsWith(suffix)) {
          total++;
          if (e.state === "closed") healthy++;
        }
      }
      if (total === 0) return 1;
      return healthy / total;
    },

    reset() {
      entries.clear();
    },
  };
}
