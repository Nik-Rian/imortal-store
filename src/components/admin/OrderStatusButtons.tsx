"use client";

import { useTransition } from "react";
import { updateOrderStatus } from "@/actions/order.actions";
import type { OrderStatus } from "@/generated/prisma/client";

export function OrderStatusButtons({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus | string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (newStatus: OrderStatus) => {
    startTransition(async () => {
      await updateOrderStatus(orderId, newStatus);
    });
  };

  if (currentStatus === "PAID") {
    return (
      <button
        onClick={() => handleUpdate("READY_FOR_PICKUP" as OrderStatus)}
        disabled={isPending}
        className="text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? "Atualizando..." : "Marcar Pronto"}
      </button>
    );
  }

  if (currentStatus === "READY_FOR_PICKUP") {
    return (
      <button
        onClick={() => handleUpdate("COMPLETED" as OrderStatus)}
        disabled={isPending}
        className="text-xs font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? "Atualizando..." : "Entregar (Concluir)"}
      </button>
    );
  }

  return (
    <span className="text-xs text-zinc-400 font-medium">
      {currentStatus === "COMPLETED" ? "Concluído" : "Sem ação"}
    </span>
  );
}
