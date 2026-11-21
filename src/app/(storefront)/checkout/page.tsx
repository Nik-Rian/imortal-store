"use client";

import { createOrder } from "@/actions/order.actions";
import {
  CardPaymentFields,
  type CardPaymentFieldsHandle,
} from "@/components/storefront/CardPaymentFields";
import { MercadoPagoInitializer } from "@/components/storefront/MercadoPagoInitializer";
import { useCart } from "@/context/CartContext";
import { checkoutSchema } from "@/lib/validations/checkout.schema";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Format CPF: 000.000.000-00
function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Format Phone: (00) 00000-0000
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

type PaymentMethod = "PIX" | "CARD";

// NEXT_PUBLIC_* is inlined at build time. Without the key, card fields cannot
// load, so the card option is hidden and checkout behaves exactly as before.
const CARD_ENABLED = Boolean(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY);

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "PIX", label: "Pix" },
  ...(CARD_ENABLED
    ? [{ value: "CARD" as const, label: "Cartão de crédito ou débito" }]
    : []),
];

function newAttemptKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, cartTotal, clearCart } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attemptKey, setAttemptKey] = useState(newAttemptKey);

  const [pendingOrder, setPendingOrder] = useState<
    { id: string; accessToken: string } | undefined
  >(undefined);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const cardRef = useRef<CardPaymentFieldsHandle>(null);

  if (items.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex justify-center text-zinc-500">
          <ShoppingBag className="h-16 w-16 stroke-1" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Seu carrinho está vazio
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Adicione produtos ao seu carrinho antes de prosseguir para o checkout.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validationResult = checkoutSchema.safeParse({
      customerName,
      customerEmail,
      customerPhone,
      customerCpf,
    });

    if (!validationResult.success) {
      setError(
        validationResult.error.issues[0]?.message ||
          "Verifique os dados informados.",
      );
      return;
    }

    const validData = validationResult.data;
    const cleanPhone = validData.customerPhone.replace(/\D/g, "");

    setIsLoading(true);

    try {
      const formattedItems = items.map((item) => ({
        productId: item.variantId ? undefined : item.productId || item.id,
        variantId: item.variantId || undefined,
        sizeId: item.sizeId || undefined,
        quantity: item.quantity,
      }));

      // Tokenization happens in the browser. Only the token reaches the server.
      const card =
        paymentMethod === "CARD"
          ? await cardRef.current?.tokenize(validData.customerCpf)
          : undefined;
      if (paymentMethod === "CARD" && !card) {
        throw new Error("Preencha os dados do cartão.");
      }

      const orderResult = await createOrder({
        orderId: pendingOrder?.id,
        accessToken: pendingOrder?.accessToken,
        attemptKey,
        customerName: validData.customerName,
        customerEmail: validData.customerEmail,
        customerPhone: cleanPhone,
        customerCpf: validData.customerCpf, // Stays in memory
        items: formattedItems,
        paymentMethod,
        card,
      });

      if (!orderResult.success || !orderResult.accessToken) {
        if (orderResult.paymentRejected) {
          // A refused payment ends that order: the next attempt is a new order.
          setPendingOrder(undefined);
          setAttemptKey(newAttemptKey());
        } else if (orderResult.orderId && orderResult.accessToken) {
          setPendingOrder({
            id: orderResult.orderId,
            accessToken: orderResult.accessToken,
          });
        }
        throw new Error(
          orderResult.error ||
            "Ocorreu um erro inesperado ao processar o pagamento.",
        );
      }

      // Clear cart and redirect using the order accessToken
      clearCart();
      router.push(`/pedidos/${orderResult.accessToken}`);
    } catch (err) {
      console.error("[CHECKOUT_SUBMIT_ERROR]", err);
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro inesperado ao gerar o pagamento Pix.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <MercadoPagoInitializer />
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar às compras
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Finalizar Pedido
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Customer Information Form */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-bold">
              Dados de Contato e Cobrança
            </h2>

            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-xs font-bold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Gabriel Santos"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none dark:border-zinc-700 dark:focus:ring-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none dark:border-zinc-700 dark:focus:ring-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                    CPF
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="000.000.000-00"
                    value={customerCpf}
                    onChange={(e) => setCustomerCpf(formatCPF(e.target.value))}
                    className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none dark:border-zinc-700 dark:focus:ring-zinc-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="(00) 90000-0000"
                    value={customerPhone}
                    onChange={(e) =>
                      setCustomerPhone(formatPhone(e.target.value))
                    }
                    className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none dark:border-zinc-700 dark:focus:ring-zinc-100"
                  />
                </div>
              </div>

              <div className="space-y-4 border-t pt-4 dark:border-zinc-800">
                {PAYMENT_OPTIONS.length > 1 && (
                  <div className="space-y-2">
                    <span className="block text-xs font-bold tracking-wider text-zinc-600 uppercase dark:text-zinc-400">
                      Forma de pagamento
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Forma de pagamento"
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {PAYMENT_OPTIONS.map((option) => {
                        const selected = paymentMethod === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={isLoading}
                            onClick={() => {
                              setPaymentMethod(option.value);
                              setError(null);
                            }}
                            className={`cursor-pointer rounded-lg border-2 px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
                              selected
                                ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {paymentMethod === "CARD" && (
                  // key: installment amounts depend on the total, so the fields
                  // remount (and re-query) if the cart total changes.
                  <CardPaymentFields
                    key={cartTotal}
                    ref={cardRef}
                    amountCents={cartTotal}
                  />
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {paymentMethod === "CARD"
                        ? "Processando Pagamento..."
                        : "Gerando Pagamento Pix..."}
                    </>
                  ) : paymentMethod === "CARD" ? (
                    "Pagar com Cartão"
                  ) : (
                    "Pagar com Pix"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Order Items Summary */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 rounded-xl border bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-lg font-bold">Resumo do Pedido</h2>

            <div className="mb-4 max-h-80 divide-y overflow-y-auto pr-1 dark:divide-zinc-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.sizeLabel ? `Tamanho: ${item.sizeLabel} | ` : ""}
                      Qtd: {item.quantity}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">
                      {((item.priceCents * item.quantity) / 100).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t pt-4 dark:border-zinc-800">
              <div className="flex justify-between text-sm text-zinc-500">
                <span>Subtotal</span>
                <span>
                  {(cartTotal / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm text-zinc-500">
                <span>Frete</span>
                <span className="text-xs font-semibold text-emerald-600 uppercase">
                  Grátis
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-extrabold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                <span>Total</span>
                <span>
                  {(cartTotal / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
