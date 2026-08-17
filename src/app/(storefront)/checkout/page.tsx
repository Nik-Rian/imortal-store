"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCart } from "@/context/CartContext";
import {
  checkoutSchema,
  CheckoutInput,
} from "@/lib/validations/checkout.schema";
import { createOrder } from "@/actions/order.actions";

export default function CheckoutPage() {
  const { items, cartTotal, clearCart } = useCart();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
  });

  const onSubmit = (data: CheckoutInput) => {
    startTransition(async () => {
      const res = await createOrder({
        ...data,
        items: items.map((item) => ({
          variantId: item.variantId!,
          quantity: item.quantity,
        })),
      });

      if (res.success && res.accessToken) {
        clearCart();
        router.push(`/pedidos/${res.accessToken}`);
      } else {
        alert(res.error || "Erro ao finalizar pedido.");
      }
    });
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Dados de Contato</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Nome Completo</label>
            <input
              {...register("customerName")}
              className="w-full border p-2 rounded mt-1"
            />
            {errors.customerName && (
              <span className="text-red-500 text-sm">
                {errors.customerName.message}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">
              Telefone / WhatsApp
            </label>
            <input
              {...register("customerPhone")}
              className="w-full border p-2 rounded mt-1"
            />
            {errors.customerPhone && (
              <span className="text-red-500 text-sm">
                {errors.customerPhone.message}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">E-mail</label>
            <input
              type="email"
              {...register("customerEmail")}
              className="w-full border p-2 rounded mt-1"
            />
            {errors.customerEmail && (
              <span className="text-red-500 text-sm">
                {errors.customerEmail.message}
              </span>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            📌 <strong>Retirada no local:</strong> Este pedido deverá ser
            retirado na loja. Não solicitamos endereço de entrega.
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-black text-white py-3 rounded font-medium disabled:opacity-50"
          >
            {isPending ? "Processando..." : "Confirmar Pedido"}
          </button>
        </form>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">Resumo do Pedido</h2>
        <div className="divide-y space-y-3">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.variantId}-${item.size}`}
              className="flex justify-between pt-3"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">
                  Tamanho: {item.size} | Qtd: {item.quantity}
                </p>
              </div>
              <p className="font-medium">
                {((item.priceCents * item.quantity) / 100).toLocaleString(
                  "pt-BR",
                  {
                    style: "currency",
                    currency: "BRL",
                  },
                )}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t mt-6 pt-4 flex justify-between font-bold text-lg">
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
  );
}
