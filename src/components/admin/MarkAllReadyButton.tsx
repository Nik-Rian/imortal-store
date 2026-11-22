"use client";

import { markAllPaidAsReady } from "@/actions/order.actions";
import { PackageCheck } from "lucide-react";
import { useTransition } from "react";

interface MarkAllReadyButtonProps {
  hasPaidOrders: boolean;
}

export function MarkAllReadyButton({ hasPaidOrders }: MarkAllReadyButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (!hasPaidOrders) return null;

  const handleMarkAll = () => {
    if (
      confirm(
        "Tem certeza que deseja marcar TODOS os pedidos pagos, aguardando preparo ou em preparo, como 'Prontos para Retirada'?",
      )
    ) {
      startTransition(async () => {
        const { updatedCount } = await markAllPaidAsReady();
        // alert() is used instead of component state: after the refresh the
        // button unmounts (no paid orders left), so inline text would vanish.
        alert(
          updatedCount === 0
            ? "Nenhum pedido foi atualizado."
            : `${updatedCount} pedido(s) marcado(s) como pronto(s) para retirada.`,
        );
      });
    }
  };

  return (
    <button
      onClick={handleMarkAll}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
    >
      <PackageCheck className="h-4 w-4" />
      {isPending ? "Atualizando..." : "Marcar Todos como Prontos"}
    </button>
  );
}
