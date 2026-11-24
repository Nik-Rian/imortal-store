import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  getClientAddress,
  readPositiveIntegerEnv,
  UNKNOWN_CLIENT_ADDRESS,
} from "./rate-limit";

describe("createRateLimiter", () => {
  const WINDOW_MS = 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the maximum and refuses the next one", () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: WINDOW_MS });

    for (let i = 0; i < 3; i++) {
      expect(limiter.consume("client")).toEqual({ allowed: true });
    }
    expect(limiter.consume("client")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("reports the remaining time of the window and does not extend it on refusals", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: WINDOW_MS });
    limiter.consume("client");

    vi.advanceTimersByTime(20_000);
    expect(limiter.consume("client")).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });

    vi.advanceTimersByTime(20_000);
    expect(limiter.consume("client")).toEqual({
      allowed: false,
      retryAfterSeconds: 20,
    });
  });

  it("keeps a separate counter for each key", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: WINDOW_MS });

    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(false);
    expect(limiter.consume("b").allowed).toBe(true);
  });

  it("starts a new window once the previous one has elapsed", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: WINDOW_MS });
    limiter.consume("client");
    expect(limiter.consume("client").allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS);

    expect(limiter.consume("client")).toEqual({ allowed: true });
    expect(limiter.consume("client").allowed).toBe(false);
  });

  it("evicts expired entries so memory does not grow without bound", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: WINDOW_MS });
    limiter.consume("a");
    limiter.consume("b");
    expect(limiter.size()).toBe(2);

    vi.advanceTimersByTime(WINDOW_MS);
    limiter.consume("c");

    expect(limiter.size()).toBe(1);
  });

  it("keeps entries whose window is still active during eviction", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: WINDOW_MS });
    limiter.consume("a");

    vi.advanceTimersByTime(30_000);
    limiter.consume("b");

    vi.advanceTimersByTime(30_000);
    limiter.consume("c");

    // "a" expired and was evicted; "b" is still inside its window.
    expect(limiter.size()).toBe(2);
    expect(limiter.consume("b").allowed).toBe(false);
  });
});

describe("getClientAddress", () => {
  it("uses the first value of x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    });
    expect(getClientAddress(headers)).toBe("203.0.113.5");
  });

  it("returns a single value as is", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
    expect(getClientAddress(headers)).toBe("203.0.113.5");
  });

  it("falls back to the shared bucket without the header", () => {
    expect(getClientAddress(new Headers())).toBe(UNKNOWN_CLIENT_ADDRESS);
  });

  it("falls back to the shared bucket when the header is empty", () => {
    const headers = new Headers({ "x-forwarded-for": "" });
    expect(getClientAddress(headers)).toBe(UNKNOWN_CLIENT_ADDRESS);
  });
});

describe("readPositiveIntegerEnv", () => {
  it.each([undefined, "", "   "])("falls back for %j", (value) => {
    expect(readPositiveIntegerEnv(value, 8)).toBe(8);
  });

  it("parses a positive integer", () => {
    expect(readPositiveIntegerEnv("5", 8)).toBe(5);
  });

  it.each(["0", "-3", "1.5", "abc"])("falls back for invalid %j", (value) => {
    expect(readPositiveIntegerEnv(value, 8)).toBe(8);
  });
});
