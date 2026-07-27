import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string({ message: "O nome do produto é obrigatório." })
    .trim()
    .min(1, "O nome do produto é obrigatório."),
  slug: z
    .string({ message: "O link permanente (slug) é obrigatório." })
    .trim()
    .min(1, "O link permanente (slug) é obrigatório."),
  description: z.string().default(""),
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
});

export type ProductInput = z.infer<typeof productSchema>;
