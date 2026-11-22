"use client";

import { updateOrderStatus } from "@/actions/order.actions";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
import {
  availableAdminTransitions,
  type AdminTransitionTarget,
} from "@/lib/order-status";
import { useState, useTransition } from "react";

const TRANSITION_BUTTONS: Record<
  AdminTransitionTarget,
  { label: string; className: string }
> = {
  PREPARING: {
    label: "Marcar em Preparo",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  },
  READY_FOR_PICKUP: {
    label: "Marcar Pronto",
    className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  },
  COMPLETED: {
    label: "Entregar (Concluir)",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  },
};

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
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = (newStatus: AdminTransitionTarget) => {
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, newStatus);
      // A refused transition (for example from a stale list) is shown instead
      // of failing silently.
      setError(result.success ? null : result.error);
    });
  };

  // Same table the server enforces, so the UI never offers a step it rejects.
  const targets = availableAdminTransitions(currentStatus, paymentStatus);

  return (
    <div className="flex flex-col items-end gap-1">
      {targets.length > 0 ? (
        <div className="flex justify-end gap-2">
          {targets.map((target) => (
            <button
              key={target}
              onClick={() => handleUpdate(target)}
              disabled={isPending}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${TRANSITION_BUTTONS[target].className}`}
            >
              {isPending ? "Atualizando..." : TRANSITION_BUTTONS[target].label}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-xs font-medium text-zinc-400">
          {currentStatus === "COMPLETED" ? "Concluído" : "Sem ação"}
        </span>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-48 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
