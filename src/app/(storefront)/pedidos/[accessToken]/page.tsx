import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { OrderPixSection } from "@/components/storefront/OrderPixSection";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react";

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
    case "CANCELLED":
      return {
        label: "Cancelado",
        icon: XCircle,
        className:
          "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
      };
    case "REFUNDED":
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

  const badge = getStatusBadge(order.status);
  const StatusIcon = badge.icon;

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar à loja
        </Link>
      </div>

      <div className="border rounded-2xl p-6 sm:p-8 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-sm space-y-6">
        {/* Header section with order ID, date, and status badge */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b dark:border-zinc-800 pb-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Pedido #{order.id.slice(-6)}
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
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
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border ${badge.className}`}
          >
            <StatusIcon className="w-4 h-4" />
            {badge.label}
          </span>
        </div>

        {/* Interactive Pix QR code and polling section if order is PENDING */}
        <OrderPixSection
          status={order.status}
          qrCode={order.pixQrCode}
          qrCodeBase64={order.pixQrCodeBase64}
        />

        {/* Customer Information Section */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 text-xs space-y-1.5">
          <p className="text-zinc-500 font-bold uppercase tracking-wider mb-2">
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
          <h2 className="font-bold text-base border-b dark:border-zinc-800 pb-2 mb-4">
            Itens Solicitados
          </h2>
          <div className="divide-y dark:divide-zinc-800">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="py-3 flex justify-between items-center text-sm"
              >
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {item.productName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {item.variantSize ? `Tamanho: ${item.variantSize} | ` : ""}
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
        <div className="border-t dark:border-zinc-800 pt-4 flex justify-between items-center text-lg font-extrabold">
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
