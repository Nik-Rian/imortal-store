"use client";

import { describeCardFailure } from "@/lib/card-outcome";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
        className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <h3 className="font-extrabold text-emerald-900 dark:text-emerald-200">
            Pagamento aprovado
          </h3>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
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
        className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20"
      >
        <Clock className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-amber-600" />
        <div>
          <h3 className="font-extrabold text-amber-900 dark:text-amber-200">
            {inReview ? "Pagamento em análise" : "Confirmando o pagamento"}
          </h3>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
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
        className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/50 dark:bg-red-950/20"
      >
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
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
            className="inline-block text-xs font-bold text-red-800 underline dark:text-red-300"
          >
            Voltar à loja
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
