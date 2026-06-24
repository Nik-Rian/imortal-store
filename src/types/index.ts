import { Product as PrismaProduct } from "../generated/prisma/client";

export type Product = PrismaProduct;

export type ProductBase = Omit<Product, "createdAt" | "updatedAt">;