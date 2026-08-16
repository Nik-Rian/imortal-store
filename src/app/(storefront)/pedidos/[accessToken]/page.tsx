import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

interface OrderPageProps {
  params: Promise<{ accessToken: string }> | { accessToken: string };
}

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const resolvedParams = await params;

  const order = await prisma.order.findUnique({
    where: { accessToken: resolvedParams.accessToken },
    include: { items: true },
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <div className="border rounded-lg p-6 shadow-sm">
        <div className="flex justify-between items-center border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Pedido #{order.id.slice(-6)}</h1>
            <p className="text-sm text-gray-500">
              {new Date(order.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
            {order.status}
          </span>
        </div>

        <div className="space-y-2 mb-6">
          <p>
            <strong>Cliente:</strong> {order.customerName}
          </p>
          <p>
            <strong>E-mail:</strong> {order.customerEmail ?? "N/A"}
          </p>
          <p>
            <strong>Telefone:</strong> {order.customerPhone ?? "N/A"}
          </p>
        </div>

        <h3 className="font-semibold text-lg border-b pb-2 mb-3">Itens</h3>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between items-center">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-gray-500">
                  {item.variantSize ? `Tam: ${item.variantSize} | ` : ""}Qtd:{" "}
                  {item.quantity}
                </p>
              </div>
              <p className="font-medium">
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

        <div className="border-t mt-6 pt-4 flex justify-between font-bold text-xl">
          <span>Total</span>
          <span>
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
