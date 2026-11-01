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
  components?: { componentProductId: string; quantity: number }[];
  _count?: { componentOf: number };
};

export type BundleComponentOption = {
  id: string;
  name: string;
  dropId: string;
  isBundle: boolean;
};

export type ProductBase = Omit<Product, "createdAt" | "updatedAt">;
