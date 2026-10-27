import {
  Product,
  ProductVariant,
  ProductSize,
  Drop,
} from "@/generated/prisma/client";

export type { Product, ProductVariant, ProductSize, Drop };

export type ProductWithVariants = Product & {
  drop?: Drop;
  sizes: ProductSize[];
  variants: ProductVariant[];
};

export type ProductBase = Omit<Product, "createdAt" | "updatedAt">;
