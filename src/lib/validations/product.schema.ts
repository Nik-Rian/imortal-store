import { z } from "zod";

export const ALLOWED_SIZES = ["P", "M", "G", "GG", "XGG"] as const;
export type AllowedSize = (typeof ALLOWED_SIZES)[number];

export const productSizeSchema = z.object({
  id: z.string().optional(),
  size: z.enum(ALLOWED_SIZES, { message: "Tamanho inválido." }),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const productVariantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "O nome da variante é obrigatório."),
  image: z.string().nullable().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(1, "O nome do produto é obrigatório."),
    slug: z.string().trim().min(1, "O link permanente é obrigatório."),
    description: z.string().trim().min(1, "A descrição é obrigatória."),
    dropId: z.string().min(1, "Selecione um Drop."),
    priceCents: z.number().int().nonnegative(),
    isAvailable: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    controlStock: z.boolean().default(false),
    hasSizes: z.boolean().default(false),
    hasVariants: z.boolean().default(false),
    showVariantsInStore: z.boolean().default(true),
    sizes: z.array(productSizeSchema).default([]),
    variants: z.array(productVariantSchema).default([]),
  })
  .refine(
    (data) => {
      const s = data.sizes.map((v) => v.size);
      return new Set(s).size === s.length;
    },
    { message: "Tamanhos duplicados não permitidos.", path: ["sizes"] },
  )
  .refine(
    (data) => {
      const n = data.variants.map((v) => v.name);
      return new Set(n).size === n.length;
    },
    { message: "Variantes duplicadas não permitidas.", path: ["variants"] },
  );

export type ProductInput = z.infer<typeof productSchema>;
