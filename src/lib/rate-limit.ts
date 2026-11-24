export const UNKNOWN_CLIENT_ADDRESS = "unknown";

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** Registers one attempt for the key and reports whether it is allowed. */
  consume(key: string): RateLimitResult;
  /** Number of keys currently stored (used to verify eviction). */
  size(): number;
};

type RateLimiterOptions = {
  maxRequests: number;
  windowMs: number;
};

type WindowEntry = {
  count: number;
  windowStart: number;
};

/**
 * Fixed-window limiter kept in process memory. State is lost on restart and is
 * not shared across instances, so it only suits a single server instance.
 * Expired windows are evicted lazily, at most once per window length, so no
 * timer is needed and memory stays bounded by the keys seen in recent windows.
 */
export function createRateLimiter({
  maxRequests,
  windowMs,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, WindowEntry>();
  let lastEvictionAt = Date.now();

  function evictExpired(now: number) {
    for (const [key, entry] of windows) {
      if (now - entry.windowStart >= windowMs) windows.delete(key);
    }
    lastEvictionAt = now;
  }

  return {
    consume(key) {
      const now = Date.now();
      if (now - lastEvictionAt >= windowMs) evictExpired(now);

      const entry = windows.get(key);
      if (!entry || now - entry.windowStart >= windowMs) {
        windows.set(key, { count: 1, windowStart: now });
        return { allowed: true };
      }

      // Refused attempts do not increment the counter or extend the window.
      if (entry.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(
            (entry.windowStart + windowMs - now) / 1000,
          ),
        };
      }

      entry.count += 1;
      return { allowed: true };
    },
    size: () => windows.size,
  };
}

/**
 * Returns the first address of x-forwarded-for. The header is trustworthy only
 * when the reverse proxy overwrites it; without the header (development) all
 * clients share one bucket.
 */
export function getClientAddress(headerList: {
  get(name: string): string | null;
}): string {
  const first = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : UNKNOWN_CLIENT_ADDRESS;
}

/** Parses a positive integer env value, falling back when unset or invalid. */
export function readPositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
