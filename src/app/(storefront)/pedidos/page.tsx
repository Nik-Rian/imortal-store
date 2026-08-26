import { getCustomerOrders } from "@/services/order.service";
import { formatPrice } from "@/lib/utils";

export default async function FindMyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const resolvedParams = await searchParams;
  const query = resolvedParams.q || "";

  let orders: Awaited<ReturnType<typeof getCustomerOrders>> = [];

  if (query) {
    orders = await getCustomerOrders(query);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
        Meus Pedidos
      </h1>
      <p className="text-zinc-600 mb-8">
        Consulte o status do seu pedido informando o e-mail ou telefone usado na
        compra.
      </p>

      <form className="flex gap-2 mb-10" method="GET" action="/pedidos">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="E-mail ou Telefone..."
          required
          className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-zinc-800 uppercase tracking-wider"
        >
          Buscar
        </button>
      </form>

      {query && orders.length === 0 && (
        <div className="rounded-md bg-white p-8 text-center border border-zinc-200 shadow-sm">
          <p className="text-zinc-500 font-medium">
            {`Nenhum pedido encontrado para "${query}".`}
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-md bg-white p-6 border border-zinc-200 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4 mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Pedido
                  </p>
                  <p className="font-mono text-sm font-bold text-zinc-900">
                    #{order.id.slice(-6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Status
                  </p>
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-800">
                    {order.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Data
                  </p>
                  <p className="text-sm font-medium text-zinc-900">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Total
                  </p>
                  <p className="text-sm font-bold text-orange-500">
                    {formatPrice(order.totalPriceCents)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="font-medium text-zinc-700">
                      {item.quantity}x {item.productName}{" "}
                      {item.variantSize ? `(${item.variantSize})` : ""}
                    </span>
                    <span className="text-zinc-500">
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
