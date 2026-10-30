import Link from "next/link";
import { getAdminOrders } from "@/services/order.service";
import { formatPrice } from "@/lib/utils";
import { OrderStatusButtons } from "@/components/admin/OrderStatusButtons";
import { PrintButton } from "@/components/admin/PrintButton";
import { MarkAllReadyButton } from "@/components/admin/MarkAllReadyButton";

import type {
  OrderStatus,
  PaymentReviewReason,
  PaymentStatus,
} from "@/generated/prisma/client";

const PAYMENT_BADGES: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pagamento pendente",
    className: "bg-amber-50 text-amber-700",
  },
  IN_REVIEW: { label: "Em análise", className: "bg-amber-50 text-amber-700" },
  PAID: { label: "Pago", className: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Falhou", className: "bg-red-50 text-red-700" },
  EXPIRED: { label: "Expirado", className: "bg-zinc-100 text-zinc-600" },
  CANCELED: { label: "Cancelado", className: "bg-zinc-100 text-zinc-600" },
  PARTIALLY_REFUNDED: {
    label: "Reembolso parcial",
    className: "bg-orange-50 text-orange-700",
  },
  REFUNDED: { label: "Reembolsado", className: "bg-orange-50 text-orange-700" },
  CHARGEBACK_IN_REVIEW: {
    label: "Chargeback em análise",
    className: "bg-red-50 text-red-700",
  },
  CHARGEBACK_LOST: {
    label: "Chargeback perdido",
    className: "bg-red-100 text-red-800",
  },
  CHARGEBACK_WON: {
    label: "Chargeback ganho",
    className: "bg-emerald-50 text-emerald-700",
  },
};

const FULFILLMENT_LABELS: Record<OrderStatus, string> = {
  PENDING: "Aguardando preparo",
  READY_FOR_PICKUP: "Pronto p/ retirada",
  COMPLETED: "Retirado",
  CANCELED: "Cancelado",
};

const REVIEW_LABELS: Record<PaymentReviewReason, string> = {
  AMOUNT_MISMATCH: "Revisar: valor divergente",
  OVERPAID: "Revisar: pago a mais",
  LATE_PAYMENT: "Revisar: pagamento tardio",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const resolvedParams = await searchParams;
  const isFilterValid = resolvedParams.filter === "valid";
  const filter = isFilterValid ? "valid" : "all";

  const orders = await getAdminOrders(filter);
  const hasPaidOrders = orders.some(
    (o) => o.paymentStatus === "PAID" && o.status === "PENDING",
  );

  return (
    <div className="space-y-6 print:space-y-0">
      {/* Header (Hidden on Print) */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-zinc-500 mt-1">
            Gerencie pagamentos e imprima as listas de retirada.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MarkAllReadyButton hasPaidOrders={hasPaidOrders} />
          <PrintButton />
        </div>
      </div>

      {/* Tabs (Hidden on Print) */}
      <div className="flex gap-4 border-b border-zinc-200 pb-2 print:hidden">
        <Link
          href="/admin/pedidos"
          className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
            !isFilterValid
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Todos os Pedidos
        </Link>
        <Link
          href="/admin/pedidos?filter=valid"
          className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
            isFilterValid
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Válidos para Retirada
        </Link>
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-tight">
          Lista de Retirada
        </h1>
        <p className="text-sm text-zinc-500">
          Impresso em:{" "}
          {new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}
        </p>
      </div>

      {/* Main Table */}
      <div className="border rounded-md bg-white shadow-sm print:border-none print:shadow-none print:bg-transparent">
        <table className="w-full text-sm text-left text-zinc-600 print:text-xs">
          <thead className="bg-zinc-50 text-zinc-900 font-medium border-b print:bg-white print:border-b-2 print:border-black">
            <tr>
              <th className="px-4 py-3 print:px-2 print:py-2">Pedido</th>
              <th className="px-4 py-3 print:px-2 print:py-2">Cliente</th>
              <th className="px-4 py-3 print:px-2 print:py-2">Itens</th>
              <th className="px-4 py-3 print:hidden">Status</th>
              <th className="px-4 py-3 print:hidden">Total</th>
              <th className="px-4 py-3 text-right print:hidden">Ações</th>
              {/* This column only exists on paper */}
              <th className="px-4 py-3 hidden print:table-cell">
                Assinatura do Cliente
              </th>
            </tr>
          </thead>
          <tbody className="divide-y print:divide-zinc-400">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className={`hover:bg-zinc-50 transition-colors break-inside-avoid print:hover:bg-transparent ${
                    order.paymentStatus === "PAID" &&
                    (order.status === "PENDING" ||
                      order.status === "READY_FOR_PICKUP")
                      ? ""
                      : "print:hidden"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 print:px-2 print:py-4">
                    #{order.id.slice(-6)}
                  </td>
                  <td className="px-4 py-3 print:px-2 print:py-4">
                    <div className="font-semibold text-zinc-900">
                      {order.customerName}
                    </div>
                    <div className="text-xs text-zinc-500 print:hidden">
                      {order.customerEmail}
                    </div>
                    {order.customerPhone && (
                      <div className="text-xs text-zinc-500">
                        {order.customerPhone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 print:px-2 print:py-4">
                    <ul className="list-disc list-inside space-y-1">
                      {order.items.map((item) => (
                        <li key={item.id} className="text-xs">
                          <span className="font-bold text-zinc-900">
                            {item.quantity}x
                          </span>{" "}
                          {item.productName}{" "}
                          {item.sizeLabel && `(${item.sizeLabel})`}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 print:hidden space-y-1">
                    <div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_BADGES[order.paymentStatus].className}`}
                      >
                        {PAYMENT_BADGES[order.paymentStatus].label}
                      </span>
                    </div>
                    <div>
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
                        {FULFILLMENT_LABELS[order.status]}
                      </span>
                    </div>
                    {order.paymentReviewReason && (
                      <div>
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                          {REVIEW_LABELS[order.paymentReviewReason]}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    {formatPrice(order.totalPriceCents)}
                  </td>
                  <td className="px-4 py-3 text-right print:hidden">
                    <OrderStatusButtons
                      orderId={order.id}
                      currentStatus={order.status}
                      paymentStatus={order.paymentStatus}
                    />
                  </td>
                  {/* Print-only empty cell for paper signature */}
                  <td className="px-4 py-3 hidden print:table-cell border-b border-zinc-300 w-48"></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
