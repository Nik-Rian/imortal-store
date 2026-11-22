"use client";

import { closeAllListings } from "@/actions/drop.actions";
import { useState, useTransition } from "react";

interface CloseAllListingsButtonProps {
  dropId: string;
  dropName: string;
}

export function CloseAllListingsButton({
  dropId,
  dropName,
}: CloseAllListingsButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedCount, setClosedCount] = useState<number | null>(null);

  const handleConfirm = () => {
    setError(null);
    setClosedCount(null);
    startTransition(async () => {
      try {
        const result = await closeAllListings(dropId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setClosedCount(result.count);
        setIsConfirming(false);
      } catch {
        setError("Erro ao fechar as vendas.");
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          Encerre a rodada de vendas do semestre {dropName} fechando todos os
          produtos e kits de uma só vez.
        </p>
        <button
          type="button"
          disabled={isPending || isConfirming}
          onClick={() => {
            setError(null);
            setClosedCount(null);
            setIsConfirming(true);
          }}
          className="inline-flex cursor-pointer items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          Fechar todas as vendas
        </button>
      </div>

      {isConfirming && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            Fechar todas as vendas do semestre {dropName}?
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">
            <li>
              O que acontece: todos os produtos e kits do semestre ficam
              indisponíveis para compra na loja.
            </li>
            <li>
              O que não muda: os pedidos existentes, os pagamentos e o preparo e
              a retirada dos pedidos continuam sendo gerenciados normalmente.
            </li>
            <li>
              O que não acontece: o semestre não é concluído e nenhum produto,
              estoque, pedido ou pagamento é apagado ou cancelado.
            </li>
            <li>
              Não há opção de desfazer em lote: para reabrir as vendas, ative
              cada produto individualmente na lista de produtos.
            </li>
          </ul>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleConfirm}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-50"
            >
              {isPending ? "Fechando vendas..." : "Confirmar fechamento"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-600">{error}</p>
      )}

      {closedCount !== null && (
        <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
          {closedCount === 0
            ? "Nenhum produto estava aberto para vendas."
            : `${closedCount} produto(s) ou kit(s) com vendas fechadas.`}
        </p>
      )}
    </div>
  );
}
