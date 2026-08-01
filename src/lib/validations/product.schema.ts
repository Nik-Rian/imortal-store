import { z } from "zod";

export const specSchema = z.object({
  label: z.string().trim(),
  value: z.string().trim(),
});

export const productSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z
    .string({ message: "O nome do produto é obrigatório." })
    .trim()
    .min(1, "O nome do produto é obrigatório."),
  slug: z
    .string({ message: "O link permanente (slug) é obrigatório." })
    .trim()
    .min(1, "O link permanente (slug) é obrigatório."),
  line: z.string().trim().optional().nullable(),
  tag: z.string().trim().optional().nullable(),
  description: z
    .string({ message: "A descrição do produto é obrigatória." })
    .trim()
    .min(1, "A descrição do produto é obrigatória."),
  story: z.string().trim().optional().nullable(),
  priceCents: z
    .number({ message: "Por favor, insira um preço válido." })
    .int("O preço deve ser um valor inteiro em centavos.")
    .nonnegative("O preço não pode ser negativo."),
  images: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  specs: z.array(specSchema).default([]),
  highlights: z.array(z.string()).default([]),
  care: z.array(z.string()).default([]),
  sortOrder: z
    .number({ message: "A ordem de exibição deve ser um número." })
    .int("A ordem de exibição deve ser um número inteiro.")
    .default(0),
  dropId: z
    .string({ message: "Por favor, selecione um Drop para o produto." })
    .min(1, "Por favor, selecione um Drop para o produto."),
});

export type ProductInput = z.infer<typeof productSchema>;
