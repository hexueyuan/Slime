import { toRaw } from "vue";

/**
 * Recursively serialize a value for safe IPC transport.
 * Strips functions, symbols; converts Vue reactive proxies to raw.
 */
export function safeSerialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const raw = toRaw(value);

  if (typeof raw === "function" || typeof raw === "symbol") return undefined;

  if (raw instanceof Date) return raw.toISOString();

  if (Array.isArray(raw)) return raw.map(safeSerialize);

  if (typeof raw === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      const v = safeSerialize((raw as Record<string, unknown>)[key]);
      if (v !== undefined) result[key] = v;
    }
    return result;
  }

  return raw;
}
