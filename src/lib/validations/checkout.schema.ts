import { z } from "zod";

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base: string, factor: number) => {
    let total = 0;
    for (const digit of base) total += Number(digit) * factor--;
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcCheckDigit(digits.slice(0, 9), 10);
  const d2 = calcCheckDigit(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

export const checkoutSchema = z.object({
  customerName: z.string().min(3, "Nome completo é obrigatório"),
  customerPhone: z.string().min(10, "Informe um telefone válido com DDD"),
  customerEmail: z.email("Informe um e-mail válido"),
  customerCpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine(isValidCPF, "Informe um CPF válido"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderItemSchema = z
  .object({
    variantId: z.string().optional(),
    productId: z.string().optional(),
    quantity: z
      .number({ message: "A quantidade é obrigatória" })
      .int("A quantidade deve ser um valor inteiro")
      .positive("A quantidade deve ser maior que zero")
      .max(100, "A quantidade máxima por item é 100"),
  })
  .refine((data) => data.variantId || data.productId, {
    message: "O item deve ter um variantId ou productId",
  });

export const createOrderSchema = checkoutSchema.extend({
  orderId: z.string().optional(),
  accessToken: z.string().optional(),
  attemptKey: z.string().optional(),
  customerPhone: z
    .string()
    .min(10, "Informe um telefone válido com DDD")
    .optional(),
  customerEmail: z.email("Informe um e-mail válido").optional(),
  items: z
    .array(orderItemSchema)
    .min(1, "O carrinho está vazio.")
    .max(50, "O carrinho excedeu o limite de itens permitidos."),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
