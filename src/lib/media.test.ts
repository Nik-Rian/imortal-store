import { describe, expect, it } from "vitest";
import { getProductImage, PLACEHOLDER_IMAGE } from "./media";

describe("getProductImage", () => {
  it("returns the first image", () => {
    expect(getProductImage(["https://a/1.png", "https://a/2.png"])).toBe(
      "https://a/1.png",
    );
  });

  it.each([[[]], [undefined], [null], [[""]]])(
    "falls back to the placeholder for %j",
    (images) => {
      expect(getProductImage(images as string[] | null | undefined)).toBe(
        PLACEHOLDER_IMAGE,
      );
    },
  );
});
