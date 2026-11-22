"use client";

import {
  concludeDrop,
  fetchDropConclusionSummary,
} from "@/actions/drop.actions";
import type { OrderStatus } from "@/generated/prisma/client";
import { BLOCKING_REASON_LABELS } from "@/lib/drop-conclusion";
import type {
  ConclusionOrderSample,
  DropConclusionSummary,
} from "@/services/drop.service";
import { useState, useTransition } from "react";

interface ConcludeDropPanelProps {
  dropId: string;
  dropName: string;
}

const FULFILLMENT_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

function OrderSampleList({
  samples,
  total,
}: {
  samples: ConclusionOrderSample[];
  total: number;
}) {
  return (
    <ul className="divide-y divide-amber-200 rounded-md border border-amber-200 bg-white text-xs text-zinc-700">
      {samples.map((order) => (
        <li
          key={order.id}
          className="flex flex-col gap-0.5 p-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="font-medium text-zinc-900">
            {order.customerName}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            #{order.id}
          </span>
          <span>
            {order.blockingReason
              ? BLOCKING_REASON_LABELS[order.blockingReason]
              : FULFILLMENT_LABELS[order.status]}
          </span>
        </li>
      ))}
      {total > samples.length && (
        <li className="p-2 text-zinc-500">
          e mais {total - samples.length} pedido(s)
        </li>
      )}
    </ul>
  );
}

export function ConcludeDropPanel({
  dropId,
  dropName,
}: ConcludeDropPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<DropConclusionSummary | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = () => {
    startTransition(async () => {
      try {
        const result = await fetchDropConclusionSummary(dropId);
        if (!result.success) {
          setSummary(null);
          setError(result.error);
          return;
        }
        setSummary(result.summary);
      } catch {
        setError("Erro ao carregar o resumo do semestre.");
      }
    });
  };

  const handleOpen = () => {
    setError(null);
    setSummary(null);
    setConfirmName("");
    setAcknowledged(false);
    setIsOpen(true);
    loadSummary();
  };

  const handleClose = () => {
    setIsOpen(false);
    setSummary(null);
    setConfirmName("");
    setAcknowledged(false);
    setError(null);
  };

  const handleConclude = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await concludeDrop(dropId, {
          confirmName,
          acknowledgeUnfulfilled: acknowledged,
        });
        if (!result.success) {
          setError(result.error);
          // Orders may have changed since the panel was opened.
          const refreshed = await fetchDropConclusionSummary(dropId);
          if (refreshed.success) setSummary(refreshed.summary);
          return;
        }
        handleClose();
      } catch {
        setError("Erro ao concluir semestre.");
      }
    });
  };

  const hasBlocking = summary !== null && summary.blockingCount > 0;
  const needsAcknowledgement =
    summary !== null && summary.acknowledgeableCount > 0;
  const canConfirm =
    summary !== null &&
    !hasBlocking &&
    (!needsAcknowledgement || acknowledged) &&
    confirmName === dropName &&
    !isPending;

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600">
          Encerrar o semestre fecha todas as vendas e exibe a mensagem de
          próximo lote na loja.
        </p>
        <button
          type="button"
          onClick={handleOpen}
          className="cursor-pointer rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
        >
          Concluir Semestre
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-amber-300 bg-amber-50 p-5">
      <div className="space-y-1">
        <p className="text-sm font-bold text-amber-900">
          Concluir o semestre {dropName}
        </p>
        <p className="text-xs text-amber-800">
          Todos os produtos serão fechados para venda e a loja passará a exibir
          a mensagem de próximo lote. Nenhum dado é apagado: pedidos, pagamentos
          e a gestão de pedidos continuam ativos. A conclusão não pode ser
          desfeita por este painel.
        </p>
      </div>

      {isPending && !summary && (
        <p className="text-xs text-amber-800">
          Carregando resumo dos pedidos...
        </p>
      )}

      {summary && hasBlocking && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-red-800">
            {summary.blockingCount} pedido(s) com pagamento não resolvido
            impedem a conclusão.
          </p>
          <ul className="text-xs text-red-700">
            {(
              Object.keys(summary.blockingByReason) as Array<
                keyof typeof summary.blockingByReason
              >
            )
              .filter((reason) => summary.blockingByReason[reason] > 0)
              .map((reason) => (
                <li key={reason}>
                  {BLOCKING_REASON_LABELS[reason]}:{" "}
                  {summary.blockingByReason[reason]}
                </li>
              ))}
          </ul>
          <OrderSampleList
            samples={summary.blockingSample}
            total={summary.blockingCount}
          />
          <p className="text-xs text-amber-800">
            Pedidos cancelados que receberam pagamento depois (pagamento tardio)
            continuam impedindo a conclusão até que o provedor registre o
            reembolso. Resolva os pedidos acima na página de Pedidos.
          </p>
        </div>
      )}

      {summary && needsAcknowledgement && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            {summary.acknowledgeableCount} pedido(s) pago(s) ainda não
            retirado(s).
          </p>
          <OrderSampleList
            samples={summary.acknowledgeableSample}
            total={summary.acknowledgeableCount}
          />
          <label className="flex items-start gap-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Estou ciente de que há pedidos pagos ainda não retirados e de que
              eles continuarão disponíveis na página de Pedidos após a
              conclusão.
            </span>
          </label>
        </div>
      )}

      {summary && !hasBlocking && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-amber-900">
            Para confirmar, digite o nome do semestre:{" "}
            <strong>{dropName}</strong>
          </label>
          <input
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            placeholder={dropName}
            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-600">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConclude}
          disabled={!canConfirm}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Concluindo..." : "Concluir semestre"}
        </button>
      </div>
    </div>
  );
}
