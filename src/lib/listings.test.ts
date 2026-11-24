import { PLACEHOLDER_IMAGE } from "@/lib/media";
import { describe, expect, it } from "vitest";
import {
  buildListings,
  resolveInitialVariant,
  type ListingProductSource,
} from "./listings";

function makeProduct(
  overrides: Partial<ListingProductSource> = {},
): ListingProductSource {
  return {
    id: "p1",
    name: "Mug",
    slug: "mug",
    priceCents: 5000,
    images: ["https://images.unsplash.com/mug.jpg"],
    isAvailable: true,
    isBundle: false,
    hasVariants: false,
    showVariantsInStore: true,
    variants: [],
    ...overrides,
  };
}

const twoVariants = [
  {
    id: "v1",
    name: "Black",
    image: "https://images.unsplash.com/black.jpg",
    isAvailable: true,
  },
  { id: "v2", name: "Red", image: null, isAvailable: true },
];

describe("buildListings", () => {
  it("produces one listing per variant when variants are shown in the store", () => {
    const listings = buildListings([
      makeProduct({ hasVariants: true, variants: twoVariants }),
    ]);

    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.title)).toEqual(["Mug - Black", "Mug - Red"]);
    expect(listings.map((l) => l.href)).toEqual([
      "/produto/mug?variante=v1",
      "/produto/mug?variante=v2",
    ]);
    expect(listings.map((l) => l.variantId)).toEqual(["v1", "v2"]);
    expect(new Set(listings.map((l) => l.key)).size).toBe(2);
  });

  it("uses the variant image when present and the product image otherwise", () => {
    const [black, red] = buildListings([
      makeProduct({ hasVariants: true, variants: twoVariants }),
    ]);

    expect(black.imageUrl).toBe("https://images.unsplash.com/black.jpg");
    expect(red.imageUrl).toBe("https://images.unsplash.com/mug.jpg");
  });

  it("falls back to the placeholder when neither variant nor product has an image", () => {
    const [listing] = buildListings([makeProduct({ images: [] })]);
    expect(listing.imageUrl).toBe(PLACEHOLDER_IMAGE);
  });

  it("produces a single listing when showVariantsInStore is false", () => {
    const listings = buildListings([
      makeProduct({
        hasVariants: true,
        showVariantsInStore: false,
        variants: twoVariants,
      }),
    ]);

    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      title: "Mug",
      href: "/produto/mug",
      variantId: null,
    });
  });

  it("produces a single listing when hasVariants is true but no variant exists", () => {
    const listings = buildListings([makeProduct({ hasVariants: true })]);
    expect(listings).toHaveLength(1);
    expect(listings[0].href).toBe("/produto/mug");
  });

  it("ignores variant rows of a product that is not flagged hasVariants", () => {
    const listings = buildListings([makeProduct({ variants: twoVariants })]);
    expect(listings).toHaveLength(1);
    expect(listings[0].href).toBe("/produto/mug");
  });

  it("places bundles before regular products and keeps the input order in each group", () => {
    const listings = buildListings([
      makeProduct({ id: "p1", slug: "mug" }),
      makeProduct({ id: "b1", slug: "kit-a", name: "Kit A", isBundle: true }),
      makeProduct({ id: "p2", slug: "cap", name: "Cap" }),
      makeProduct({ id: "b2", slug: "kit-b", name: "Kit B", isBundle: true }),
    ]);

    expect(listings.map((l) => l.productId)).toEqual(["b1", "b2", "p1", "p2"]);
    expect(listings.map((l) => l.group)).toEqual([
      "BUNDLES",
      "BUNDLES",
      "PRODUCTS",
      "PRODUCTS",
    ]);
  });

  it("closes every listing of an unavailable product", () => {
    const listings = buildListings([
      makeProduct({
        isAvailable: false,
        hasVariants: true,
        variants: twoVariants,
      }),
    ]);

    expect(listings.map((l) => l.state)).toEqual(["CLOSED", "CLOSED"]);
  });

  it("closes only the listing of an unavailable variant", () => {
    const listings = buildListings([
      makeProduct({
        hasVariants: true,
        variants: [twoVariants[0], { ...twoVariants[1], isAvailable: false }],
      }),
    ]);

    expect(listings.map((l) => l.state)).toEqual(["OPEN", "CLOSED"]);
  });

  it("never closes an available product without variants", () => {
    const [listing] = buildListings([makeProduct()]);
    expect(listing.state).toBe("OPEN");
  });

  it("closes the single listing when every hidden variant is unavailable", () => {
    const [listing] = buildListings([
      makeProduct({
        hasVariants: true,
        showVariantsInStore: false,
        variants: twoVariants.map((v) => ({ ...v, isAvailable: false })),
      }),
    ]);

    expect(listing.state).toBe("CLOSED");
  });
});

describe("resolveInitialVariant", () => {
  const variants = [
    { id: "v1", isAvailable: false },
    { id: "v2", isAvailable: true },
    { id: "v3", isAvailable: true },
  ];

  it("returns the requested variant when it is available", () => {
    expect(resolveInitialVariant(variants, "v3")).toBe("v3");
  });

  it("falls back to the first available variant when the requested one is unavailable", () => {
    expect(resolveInitialVariant(variants, "v1")).toBe("v2");
  });

  it("falls back to the first available variant when the id is unknown", () => {
    expect(resolveInitialVariant(variants, "unknown")).toBe("v2");
  });

  it("falls back to the first available variant when nothing is requested", () => {
    expect(resolveInitialVariant(variants, undefined)).toBe("v2");
    expect(resolveInitialVariant(variants, null)).toBe("v2");
  });

  it("returns null when no variant is available or none exists", () => {
    expect(
      resolveInitialVariant([{ id: "v1", isAvailable: false }], "v1"),
    ).toBeNull();
    expect(resolveInitialVariant([], "v1")).toBeNull();
  });
});
