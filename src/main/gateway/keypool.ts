import type { ChannelKey } from "@shared/types/gateway";
import type { CircuitBreaker } from "./circuit";

export interface KeyPool {
  selectKey(
    keys: ChannelKey[],
    channelId: number,
    model: string,
    circuitBreaker: CircuitBreaker,
  ): ChannelKey | undefined;
  mark429(channelId: number, keyId: number, cooldownMs?: number): void;
}

const DEFAULT_429_COOLDOWN = 60_000;

export function createKeyPool(): KeyPool {
  const rateLimited = new Map<string, number>();

  function rlKey(channelId: number, keyId: number): string {
    return `${channelId}:${keyId}`;
  }

  return {
    selectKey(keys, channelId, model, circuitBreaker) {
      const now = Date.now();
      for (const k of keys) {
        if (!k.enabled) continue;
        const expiry = rateLimited.get(rlKey(channelId, k.id));
        if (expiry && now < expiry) continue;
        if (circuitBreaker.isTripped(channelId, k.id, model)) continue;
        return k;
      }
      return undefined;
    },

    mark429(channelId, keyId, cooldownMs = DEFAULT_429_COOLDOWN) {
      rateLimited.set(rlKey(channelId, keyId), Date.now() + cooldownMs);
    },
  };
}
