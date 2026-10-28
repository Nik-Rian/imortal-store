import { describe, expect, it } from "vitest";
import { buildStockKey } from "./stock-key";

describe("buildStockKey", () => {
  it("produces a distinct key for each combination shape", () => {
    const keys = [
      buildStockKey("p"),
      buildStockKey("p", "v"),
      buildStockKey("p", null, "s"),
      buildStockKey("p", "v", "s"),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it("treats undefined and null the same", () => {
    expect(buildStockKey("p", undefined, null)).toBe(buildStockKey("p"));
  });

  it("is stable", () => {
    expect(buildStockKey("p", "v", "s")).toBe("p#v#s");
  });
});
