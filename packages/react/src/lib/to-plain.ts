// Deep-clone any value into a plain JSON-safe object.
// Strips valtio proxies, preserves Dates, drops functions/symbols.

export function toPlain<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return new Date(value.getTime()) as T;

  if (Array.isArray(value)) return value.map(toPlain) as T;

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'function' || typeof v === 'symbol') continue;
      out[k] = toPlain(v);
    }
    return out as T;
  }

  return value;
}
