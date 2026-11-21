import { OrderCardSection } from "@/components/storefront/OrderCardSection";
import { OrderPixSection } from "@/components/storefront/OrderPixSection";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

interface OrderPageProps {
  params: Promise<{ accessToken: string }> | { accessToken: string };
}

// Map database order status to localized labels and visual badge styles
function getStatusBadge(status: string) {
  switch (status) {
    case "PAID":
      return {
        label: "Pago",
        icon: CheckCircle2,
        className:
          "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
      };
    case "PENDING":
      return {
        label: "Aguardando Pagamento",
        icon: Clock,
        className:
          "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
      };
    case "IN_REVIEW":
      return {
        label: "Pagamento em análise",
        icon: Clock,
        className:
          "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
      };
    case "FAILED":
      return {
        label: "Pagamento recusado",
        icon: XCircle,
        className:
          "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
      };
    case "CANCELED":
    case "EXPIRED":
      return {
        label: "Cancelado",
        icon: XCircle,
        className:
          "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
      };
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return {
        label: "Reembolsado",
        icon: RefreshCw,
        className:
          "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
      };
    default:
      return {
        label: status,
        icon: Clock,
        className: "bg-zinc-100 text-zinc-800 border-zinc-200",
      };
  }
}

// The page URL acts as the access credential for the order. It must stay out of
// search indexes and must not be forwarded to third parties via the Referer header.
export function generateMetadata(): Metadata {
  return {
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const resolvedParams = await params;

  // Retrieve order details from database using the secure accessToken
  const order = await prisma.order.findUnique({
    where: { accessToken: resolvedParams.accessToken },
    include: { items: true },
  });

  if (!order) {
    notFound();
  }

  const badge = getStatusBadge(order.paymentStatus);
  const StatusIcon = badge.icon;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar à loja
        </Link>
      </div>

      <div className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header section with order ID, date, and status badge */}
        <div className="flex flex-col items-start justify-between gap-4 border-b pb-6 sm:flex-row sm:items-center dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Pedido #{order.id.slice(-6)}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Realizado em{" "}
              {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold ${badge.className}`}
          >
            <StatusIcon className="h-4 w-4" />
            {badge.label}
          </span>
        </div>

        {/* Interactive Pix QR code and polling section if order is PENDING */}
        {order.paymentMethod === "CARD" ? (
          <OrderCardSection
            status={order.paymentStatus}
            providerStatusDetail={order.providerStatusDetail}
          />
        ) : (
          <OrderPixSection
            status={order.paymentStatus}
            qrCode={order.pixQrCode}
            qrCodeBase64={order.pixQrCodeBase64}
          />
        )}

        {/* Customer Information Section */}
        <div className="space-y-1.5 rounded-xl bg-zinc-50 p-4 text-xs dark:bg-zinc-800/50">
          <p className="mb-2 font-bold tracking-wider text-zinc-500 uppercase">
            Dados do Cliente
          </p>
          <p className="text-zinc-800 dark:text-zinc-200">
            <strong>Nome:</strong> {order.customerName}
          </p>
          {order.customerEmail && (
            <p className="text-zinc-800 dark:text-zinc-200">
              <strong>E-mail:</strong> {order.customerEmail}
            </p>
          )}
          {order.customerPhone && (
            <p className="text-zinc-800 dark:text-zinc-200">
              <strong>Telefone:</strong> {order.customerPhone}
            </p>
          )}
        </div>

        {/* Order Items Breakdown */}
        <div>
          <h2 className="mb-4 border-b pb-2 text-base font-bold dark:border-zinc-800">
            Itens Solicitados
          </h2>
          <div className="divide-y dark:divide-zinc-800">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {item.productName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {item.sizeLabel ? `Tamanho: ${item.sizeLabel} | ` : ""}
                    Qtd: {item.quantity}
                  </p>
                </div>
                <p className="font-bold text-zinc-900 dark:text-zinc-100">
                  {((item.unitPriceCents * item.quantity) / 100).toLocaleString(
                    "pt-BR",
                    {
                      style: "currency",
                      currency: "BRL",
                    },
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Order Summary Total */}
        <div className="flex items-center justify-between border-t pt-4 text-lg font-extrabold dark:border-zinc-800">
          <span>Total do Pedido</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {(order.totalPriceCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
