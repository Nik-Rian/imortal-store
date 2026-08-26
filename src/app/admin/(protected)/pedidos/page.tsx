import Link from "next/link";
import { getAdminOrders } from "@/services/order.service";
import { formatPrice } from "@/lib/utils";
import { OrderStatusButtons } from "@/components/admin/OrderStatusButtons";
import { PrintButton } from "@/components/admin/PrintButton";
import { MarkAllReadyButton } from "@/components/admin/MarkAllReadyButton";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const resolvedParams = await searchParams;
  const isFilterValid = resolvedParams.filter === "valid";
  const filter = isFilterValid ? "valid" : "all";

  const orders = await getAdminOrders(filter);
  const hasPaidOrders = orders.some((o) => o.status === "PAID");

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
                  className="hover:bg-zinc-50 transition-colors break-inside-avoid print:hover:bg-transparent"
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
                          {item.variantSize && `(${item.variantSize})`}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    {formatPrice(order.totalPriceCents)}
                  </td>
                  <td className="px-4 py-3 text-right print:hidden">
                    <OrderStatusButtons
                      orderId={order.id}
                      currentStatus={order.status}
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
