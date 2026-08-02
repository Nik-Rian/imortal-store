import {
  Product as PrismaProduct,
  ProductVariant as PrismaProductVariant,
  Drop as PrismaDrop,
} from "../generated/prisma/client";

export type ProductSpec = {
  label: string;
  value: string;
};

export type ProductVariant = PrismaProductVariant;

export type Product = PrismaProduct & {
  drop?: PrismaDrop;
  variants?: PrismaProductVariant[];
  specs?: ProductSpec[] | unknown;
};

export type ProductBase = Omit<Product, "createdAt" | "updatedAt">;

