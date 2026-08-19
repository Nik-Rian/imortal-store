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
