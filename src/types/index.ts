import {
  Product as PrismaProduct,
  ProductVariant,
  Drop,
} from "../generated/prisma/client";

export type Product = PrismaProduct;

export type ProductWithVariants = PrismaProduct & {
  variants?: ProductVariant[];
  drop?: Drop | null;
};

export type ProductBase = Omit<Product, "createdAt" | "updatedAt">;
