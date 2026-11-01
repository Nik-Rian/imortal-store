import { describe, expect, it } from "vitest";
import {
  detectImageType,
  getBundleGalleryImages,
  getProductImage,
  PLACEHOLDER_IMAGE,
} from "./media";

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

describe("detectImageType", () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);

  it("detects JPEG", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });
  it("detects PNG", () => {
    expect(
      detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("image/png");
  });
  it("detects WebP", () => {
    expect(
      detectImageType(
        bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });
  it("rejects RIFF files that are not WebP (e.g. WAV)", () => {
    expect(
      detectImageType(
        bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull();
  });
  it("rejects text, SVG and empty input", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("getBundleGalleryImages", () => {
  const component = (...images: string[]) => ({ componentProduct: { images } });

  it("lists the components' images in component order", () => {
    expect(
      getBundleGalleryImages(
        ["https://a/bundle.png"],
        [
          component("https://a/1.png", "https://a/2.png"),
          component("https://a/3.png"),
        ],
      ),
    ).toEqual(["https://a/1.png", "https://a/2.png", "https://a/3.png"]);
  });

  it("removes URLs shared by several components", () => {
    expect(
      getBundleGalleryImages(
        [],
        [
          component("https://a/1.png"),
          component("https://a/1.png", "https://a/2.png"),
        ],
      ),
    ).toEqual(["https://a/1.png", "https://a/2.png"]);
  });

  it("falls back to the bundle's own images when no component has one", () => {
    expect(
      getBundleGalleryImages(
        ["https://a/bundle.png"],
        [component(), component()],
      ),
    ).toEqual(["https://a/bundle.png"]);
  });

  it("returns an empty list when there are no images at all", () => {
    expect(getBundleGalleryImages(null, [])).toEqual([]);
  });

  it("ignores empty URLs", () => {
    expect(
      getBundleGalleryImages([], [component("", "https://a/1.png")]),
    ).toEqual(["https://a/1.png"]);
  });
});
