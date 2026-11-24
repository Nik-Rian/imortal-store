"use client";

import { reconcileStalePaymentsAction } from "@/actions/reconcile.actions";
import type { ReconciliationSummary } from "@/services/reconciliation.service";
import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

export function ReconcileButton() {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReconcile = () => {
    setError(null);
    startTransition(async () => {
      const result = await reconcileStalePaymentsAction();
      if (result.success) {
        setSummary(result.summary);
      } else {
        setSummary(null);
        setError(result.error);
      }
    });
  };

  const close = () => {
    setSummary(null);
    setError(null);
  };

  const needsAttention = summary
    ? summary.outcomes.provider_order_missing +
      summary.outcomes.search_window_exceeded +
      summary.outcomes.conflict
    : 0;

  return (
    <div className="relative">
      <button
        onClick={handleReconcile}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Reconciliando..." : "Reconciliar Pagamentos"}
      </button>

      {(summary || error) && (
        <div
          role="status"
          className="absolute right-0 z-10 mt-2 w-80 space-y-2 rounded-md border bg-white p-4 text-sm text-zinc-700 shadow-lg"
        >
          {error && <p className="text-red-700">{error}</p>}

          {summary && (
            <>
              <p className="font-medium text-zinc-900">
                Pedidos analisados: {summary.examined}
              </p>
              <ul className="space-y-1">
                <li>Atualizados: {summary.outcomes.synced}</li>
                <li>Cancelados por abandono: {summary.outcomes.abandoned}</li>
                <li>
                  Ainda pendentes no provedor: {summary.outcomes.still_pending}
                </li>
                <li>
                  Aguardando prazo de abandono:{" "}
                  {summary.outcomes.awaiting_abandonment}
                </li>
                <li>Requerem atenção: {needsAttention}</li>
                <li>Falhas: {summary.outcomes.failed}</li>
              </ul>

              {summary.stalePending.length > 0 && (
                <div>
                  <p className="font-medium text-zinc-900">
                    Pagamentos ainda pendentes:
                  </p>
                  <ul className="list-inside list-disc text-xs">
                    {summary.stalePending.map((item) => (
                      <li key={item.orderId}>
                        #{item.orderId.slice(-6)} (
                        {item.paymentMethod === "CARD" ? "Cartão" : "Pix"})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.failures.length > 0 && (
                <div>
                  <p className="font-medium text-red-700">Falhas:</p>
                  <ul className="list-inside list-disc text-xs text-red-700">
                    {summary.failures.map((failure) => (
                      <li key={failure.orderId}>
                        #{failure.orderId.slice(-6)}: {failure.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <button
            onClick={close}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
