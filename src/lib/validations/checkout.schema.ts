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
    sizeId: z.string().optional(),
    sizeLabel: z.string().optional(),
    quantity: z
      .number({ message: "A quantidade é obrigatória" })
      .int("A quantidade deve ser um valor inteiro")
      .positive("A quantidade deve ser maior que zero")
      .max(100, "A quantidade máxima por item é 100"),
  })
  .refine((data) => data.variantId || data.productId, {
    message: "O item deve ter um variantId ou productId",
  });

  export const MAX_CARD_INSTALLMENTS = 3;

  /**
   * Tokenized card data only. The token is produced in the browser by Mercado
   * Pago's SDK. strictObject rejects any extra key, so a client that accidentally
   * sends raw card fields (number, cvv...) is refused instead of processed.
   */
  export const cardPaymentSchema = z
    .strictObject({
      token: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{32,33}$/, "Token do cartão inválido."),
      paymentMethodId: z
        .string()
        .trim()
        .regex(/^[a-z0-9_]{2,32}$/, "Bandeira do cartão inválida."),
      paymentTypeId: z.enum(["credit_card", "debit_card"], {
        message: "Tipo de cartão inválido.",
      }),
      installments: z
        .number({ message: "Informe o número de parcelas." })
        .int("O número de parcelas deve ser inteiro.")
        .min(1, "O número de parcelas deve ser de no mínimo 1.")
        .max(
          MAX_CARD_INSTALLMENTS,
          `O parcelamento máximo é de ${MAX_CARD_INSTALLMENTS}x.`,
        ),
    })
    .refine(
      (card) => card.paymentTypeId !== "debit_card" || card.installments === 1,
      {
        message: "Cartão de débito não permite parcelamento.",
        path: ["installments"],
      },
    );

export const createOrderSchema = checkoutSchema.extend({
  orderId: z.string().optional(),
  accessToken: z.string().optional(),
  attemptKey: z.string().optional(),
  paymentMethod: z
    .enum(["PIX", "CARD"], { message: "Método de pagamento inválido." })
    .optional(),
  card: cardPaymentSchema.optional(),
  customerPhone: z
    .string()
    .min(10, "Informe um telefone válido com DDD")
    .optional(),
  customerEmail: z.email("Informe um e-mail válido").optional(),
  items: z
    .array(orderItemSchema)
    .min(1, "O carrinho está vazio.")
        .max(50, "O carrinho excedeu o limite de itens permitidos."),
  }).superRefine((data, ctx) => {
    if (data.paymentMethod === "CARD" && !data.card) {
      ctx.addIssue({ code: "custom", message: "Dados do cartão ausentes.", path: ["card"] });
    }
    if (data.paymentMethod !== "CARD" && data.card) {
      ctx.addIssue({
        code: "custom",
        message: "Dados do cartão não são aceitos para este método de pagamento.",
        path: ["card"],
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
