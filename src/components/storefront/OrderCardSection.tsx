"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { describeCardFailure } from "@/lib/card-outcome";

interface OrderCardSectionProps {
  status: string;
  providerStatusDetail: string | null;
}

// Statuses that can still change without any action from the customer.
const POLLING_STATUSES = ["PENDING", "IN_REVIEW"];

export function OrderCardSection({
  status,
  providerStatusDetail,
}: OrderCardSectionProps) {
  const router = useRouter();

  useEffect(() => {
    if (!POLLING_STATUSES.includes(status)) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [status, router]);

  if (status === "PAID") {
    return (
      <div
        role="status"
        className="mt-6 flex items-start gap-3 border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-5"
      >
        <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
        <div>
          <h3 className="font-extrabold text-emerald-900 dark:text-emerald-200">
            Pagamento aprovado
          </h3>
          <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
            Recebemos a confirmação do seu pagamento com cartão.
          </p>
        </div>
      </div>
    );
  }

  if (status === "PENDING" || status === "IN_REVIEW") {
    const inReview = status === "IN_REVIEW";
    return (
      <div
        role="status"
        className="mt-6 flex items-start gap-3 border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-5"
      >
        <Clock className="w-5 h-5 mt-0.5 text-amber-600 shrink-0 animate-pulse" />
        <div>
          <h3 className="font-extrabold text-amber-900 dark:text-amber-200">
            {inReview ? "Pagamento em análise" : "Confirmando o pagamento"}
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            {inReview
              ? "Seu pagamento está em análise. Isso pode levar alguns minutos. Não é necessário pagar novamente: esta página atualiza sozinha assim que houver uma resposta."
              : "Estamos aguardando a confirmação do seu cartão. Esta página atualiza automaticamente."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "FAILED" || status === "CANCELED" || status === "EXPIRED") {
    return (
      <div
        role="alert"
        className="mt-6 flex items-start gap-3 border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 rounded-xl p-5"
      >
        <XCircle className="w-5 h-5 mt-0.5 text-red-600 shrink-0" />
        <div className="space-y-2">
          <h3 className="font-extrabold text-red-900 dark:text-red-200">
            {status === "FAILED"
              ? "Pagamento não aprovado"
              : "Pedido cancelado"}
          </h3>
          <p className="text-xs text-red-800 dark:text-red-300">
            {status === "FAILED"
              ? describeCardFailure(providerStatusDetail)
              : "Este pedido foi cancelado."}{" "}
            Você pode fazer um novo pedido na loja.
          </p>
          <Link
            href="/"
            className="inline-block text-xs font-bold text-red-800 dark:text-red-300 underline"
          >
            Voltar à loja
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
