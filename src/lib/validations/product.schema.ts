import { z } from "zod";

export const ALLOWED_SIZES = ["P", "M", "G"] as const;
export type AllowedSize = (typeof ALLOWED_SIZES)[number];

export const productVariantSchema = z.object({
  id: z.string().optional(),
  size: z.enum(ALLOWED_SIZES, {
    message: "O tamanho deve ser P, M ou G.",
  }),
  sortOrder: z
    .number({ message: "A ordem deve ser um número." })
    .int("A ordem deve ser um número inteiro.")
    .default(0),
});

export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const productSchema = z
  .object({
    name: z
      .string({ message: "O nome do produto é obrigatório." })
      .trim()
      .min(1, "O nome do produto é obrigatório."),
    slug: z
      .string({ message: "O link permanente (slug) é obrigatório." })
      .trim()
      .min(1, "O link permanente (slug) é obrigatório."),
    description: z
      .string({ message: "A descrição do produto é obrigatória." })
      .trim()
      .min(1, "A descrição do produto é obrigatória."),
    dropId: z
      .string({ message: "Por favor, selecione um Drop para o produto." })
      .min(1, "Por favor, selecione um Drop para o produto."),
    priceCents: z
      .number({ message: "Por favor, insira um preço válido." })
      .int("O preço deve ser um valor inteiro em centavos.")
      .nonnegative("O preço não pode ser negativo."),
    sortOrder: z
      .number({ message: "A ordem de exibição deve ser um número." })
      .int("A ordem de exibição deve ser um número inteiro.")
      .default(0),
    variants: z.array(productVariantSchema).default([]),
  })
  .refine(
    (data) => {
      const sizes = data.variants.map((v) => v.size);
      return new Set(sizes).size === sizes.length;
    },
    {
      message:
        "Não é permitido cadastrar tamanhos duplicados no mesmo produto.",
      path: ["variants"],
    },
  );

export type ProductInput = z.infer<typeof productSchema>;
