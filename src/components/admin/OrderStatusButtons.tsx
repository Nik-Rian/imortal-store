"use client";

import { updateOrderStatus } from "@/actions/order.actions";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
import { nextAdminStatus } from "@/lib/order-status";
import { useTransition } from "react";

export function OrderStatusButtons({
  orderId,
  currentStatus,
  paymentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (newStatus: OrderStatus) => {
    startTransition(async () => {
      await updateOrderStatus(orderId, newStatus);
    });
  };

  // Same table the server enforces, so the UI never offers a step it rejects.
  const next = nextAdminStatus(currentStatus, paymentStatus);

  if (next === "READY_FOR_PICKUP") {
    return (
      <button
        onClick={() => handleUpdate("READY_FOR_PICKUP" as OrderStatus)}
        disabled={isPending}
        className="rounded-md bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50"
      >
        {isPending ? "Atualizando..." : "Marcar Pronto"}
      </button>
    );
  }

  if (next === "COMPLETED") {
    return (
      <button
        onClick={() => handleUpdate("COMPLETED" as OrderStatus)}
        disabled={isPending}
        className="rounded-md bg-blue-100 px-2.5 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-200 disabled:opacity-50"
      >
        {isPending ? "Atualizando..." : "Entregar (Concluir)"}
      </button>
    );
  }

  return (
    <span className="text-xs font-medium text-zinc-400">
      {currentStatus === "COMPLETED" ? "Concluído" : "Sem ação"}
    </span>
  );
}
