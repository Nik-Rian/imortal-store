"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";

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

export default function CheckoutPage() {
  const router = useRouter();
  const { items, cartTotal, clearCart } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-md">
        <div className="flex justify-center mb-4 text-zinc-500">
          <ShoppingBag className="w-16 h-16 stroke-1" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Seu carrinho está vazio
        </h1>
        <p className="text-zinc-500 mb-6 text-sm">
          Adicione produtos ao seu carrinho antes de prosseguir para o checkout.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-800 h-10 px-6 py-2 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCpf = customerCpf.replace(/\D/g, "");
    const cleanPhone = customerPhone.replace(/\D/g, "");

    if (cleanCpf.length < 11) {
      setError("Por favor, informe um CPF válido com 11 dígitos.");
      return;
    }

    if (cleanPhone.length < 10) {
      setError("Por favor, informe um telefone válido com DDD.");
      return;
    }

    setIsLoading(true);

    try {
      // Map cart items into payload format required by backend API
      const formattedItems = items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId || item.id,
        quantity: item.quantity,
      }));

      const response = await fetch("/api/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerCpf: cleanCpf,
          customerPhone: cleanPhone,
          items: formattedItems,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Falha ao processar o checkout.");
      }

      // Clear cart on successful order creation and redirect to order status page
      clearCart();
      router.push(`/pedidos/${data.accessToken}`);
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
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar às compras
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight mt-2">
          Finalizar Pedido
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Customer Information Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border rounded-xl p-6 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-sm">
            <h2 className="text-lg font-bold mb-4">
              Dados de Contato e Cobrança
            </h2>

            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Gabriel Santos"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="000.000.000-00"
                    value={customerCpf}
                    onChange={(e) => setCustomerCpf(formatCPF(e.target.value))}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1">
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
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  />
                </div>
              </div>

              <div className="pt-4 border-t dark:border-zinc-800">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-sm transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gerando Pagamento Pix...
                    </>
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
          <div className="border rounded-xl p-6 bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800 sticky top-6">
            <h2 className="text-lg font-bold mb-4">Resumo do Pedido</h2>

            <div className="divide-y dark:divide-zinc-800 max-h-80 overflow-y-auto mb-4 pr-1">
              {items.map((item) => (
                <div key={item.id} className="py-3 flex gap-3 items-center">
                  <div className="relative w-14 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-md overflow-hidden shrink-0">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.size ? `Tamanho: ${item.size} | ` : ""}Qtd:{" "}
                      {item.quantity}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
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

            <div className="border-t dark:border-zinc-800 pt-4 space-y-2">
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
                <span className="text-emerald-600 font-semibold uppercase text-xs">
                  Grátis
                </span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-zinc-900 dark:text-zinc-100 pt-2 border-t dark:border-zinc-800">
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
