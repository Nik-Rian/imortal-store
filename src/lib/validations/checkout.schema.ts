import { z } from "zod";

export const checkoutSchema = z.object({
  customerName: z.string().min(3, "Nome completo é obrigatório"),
  customerPhone: z.string().min(10, "Informe um telefone válido com DDD"),
  customerEmail: z.email("Informe um e-mail válido"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
