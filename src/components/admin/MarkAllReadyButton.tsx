"use client";

import { useTransition } from "react";
import { markAllPaidAsReady } from "@/actions/order.actions";
import { PackageCheck } from "lucide-react";

interface MarkAllReadyButtonProps {
  hasPaidOrders: boolean;
}

export function MarkAllReadyButton({ hasPaidOrders }: MarkAllReadyButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (!hasPaidOrders) return null;

  const handleMarkAll = () => {
    if (
      confirm(
        "Tem certeza que deseja marcar TODOS os pedidos 'Pagos' como 'Prontos para Retirada'?",
      )
    ) {
      startTransition(async () => {
        await markAllPaidAsReady();
      });
    }
  };

  return (
    <button
      onClick={handleMarkAll}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
    >
      <PackageCheck className="h-4 w-4" />
      {isPending ? "Atualizando..." : "Marcar Todos como Prontos"}
    </button>
  );
}
